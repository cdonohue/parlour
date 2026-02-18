import { join, basename, resolve } from 'node:path'
import { readFile, writeFile, mkdir, rm, symlink, readdir, stat } from 'node:fs/promises'
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PtyManager } from './pty-manager'
import { GitService } from './git-service'
import { PARLOUR_DIR, BARE_DIR, PROJECT_SETUP_DIR, createChatDir, writeAgentsMd, scanProjects, copySkillsToChat, ensureGlobalSkills } from './parlour-dirs'
import type { ProjectInfo } from './parlour-dirs'
import { generateCliConfig } from './cli-config'
import { resolveCliType, getResumeArgs } from './cli-detect'
import { logger as rootLogger } from './logger'
import { lifecycle } from './lifecycle'
import type { HarnessEvent } from './lifecycle'
import { createParser } from './harness-parser'
import { HarnessTracker } from './harness-tracker'

const execAsync = promisify(execFile)
const log = rootLogger.child({ service: 'ChatRegistry' })

type ChatStatus = 'active' | 'idle' | 'done' | 'error'

interface ChatRecord {
  id: string
  name: string
  status: ChatStatus
  ptyId: string | null
  dirPath: string
  createdAt: number
  lastActiveAt: number
  pinnedAt: number | null
  parentId?: string
  llmCommand?: string
  projects?: ProjectInfo[]
}

export interface CreateChatOpts {
  name?: string
  llmCommand?: string
  prompt?: string
  background?: boolean
  onExit?: (exitCode: number) => void
  project?: { pathOrUrl: string; branch?: string; base?: string }
}

export class ChatRegistry {
  private static IDLE_THRESHOLD = 3000
  private chats: ChatRecord[] = []
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private harnessTrackers = new Map<string, HarnessTracker>()
  private ptyManager: PtyManager
  private settingsGetter: () => { llmCommand: string; maxChatDepth: number; projectRoots: string[] }
  private getTheme: () => 'dark' | 'light'
  private onStateChanged: (state: { chats: ChatRecord[] }) => void
  private stateListeners: Array<(state: { chats: ChatRecord[] }) => void> = []
  private persistTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    ptyManager: PtyManager,
    settingsGetter: () => { llmCommand: string; maxChatDepth: number; projectRoots: string[] },
    getTheme: () => 'dark' | 'light',
    onStateChanged: (state: { chats: ChatRecord[] }) => void,
  ) {
    this.ptyManager = ptyManager
    this.settingsGetter = settingsGetter
    this.getTheme = getTheme
    this.onStateChanged = onStateChanged
  }

  private themeEnv(): Record<string, string> {
    const light = this.getTheme() === 'light'
    return { COLORFGBG: light ? '0;15' : '15;0' }
  }

  getState(): { chats: ChatRecord[] } {
    return { chats: this.chats }
  }

  getChat(id: string): ChatRecord | undefined {
    return this.chats.find((c) => c.id === id)
  }

  getChildren(parentId: string): ChatRecord[] {
    return this.chats.filter((c) => c.parentId === parentId)
  }

  getChatDepth(chatId: string): number {
    let depth = 0
    let current = this.chats.find((c) => c.id === chatId)
    while (current?.parentId) {
      depth++
      current = this.chats.find((c) => c.id === current!.parentId)
    }
    return depth
  }

  updateChat(id: string, partial: Partial<Omit<ChatRecord, 'id'>>): void {
    const idx = this.chats.findIndex((c) => c.id === id)
    if (idx === -1) return
    this.chats[idx] = { ...this.chats[idx], ...partial }
    this.persistChat(this.chats[idx])
    this.pushToRenderer()
  }

  // ── Project management ──

  async cloneProject(chatDir: string, pathOrUrl: string, branch?: string, base?: string): Promise<ProjectInfo> {
    const projectsDir = join(chatDir, 'projects')
    await mkdir(projectsDir, { recursive: true })

    const isUrl = pathOrUrl.includes('://') || pathOrUrl.endsWith('.git')

    if (!isUrl) {
      pathOrUrl = resolve(pathOrUrl)
      if (!existsSync(pathOrUrl)) {
        const resolved = this.resolveFromRoots(pathOrUrl)
        if (resolved) {
          pathOrUrl = resolved
        } else {
          const roots = this.settingsGetter().projectRoots
          const hint = roots.length > 0
            ? ` (also searched project roots: ${roots.join(', ')})`
            : ' — configure projectRoots in settings to search by name'
          throw new Error(`Path does not exist: ${pathOrUrl}${hint}`)
        }
      }
    }

    const name = basename(pathOrUrl).replace(/\.git$/, '')
    const targetPath = join(projectsDir, name)

    if (isUrl) {
      const bareDir = join(BARE_DIR, `${name}.git`)
      await mkdir(BARE_DIR, { recursive: true })

      if (existsSync(bareDir)) {
        await GitService.fetchAll(bareDir)
      } else {
        await GitService.cloneBare(pathOrUrl, bareDir)
      }

      await GitService.cloneLocal(bareDir, targetPath)
      await GitService.setRemoteUrl(targetPath, 'origin', pathOrUrl)
    } else {
      const isGit = await GitService.isGitRepo(pathOrUrl).catch(() => false)

      if (isGit) {
        await GitService.cloneLocal(pathOrUrl, targetPath)
        const sourceOrigin = await GitService.getRemoteUrl(pathOrUrl)
        if (sourceOrigin) {
          await GitService.setRemoteUrl(targetPath, 'origin', sourceOrigin)
          await GitService.fetchAll(targetPath)
        }
      } else {
        await symlink(pathOrUrl, targetPath)
        return { name, path: targetPath, isGitRepo: false }
      }
    }

    let currentBranch: string | undefined
    if (branch && base) {
      await GitService.checkoutNewBranch(targetPath, branch, base)
      currentBranch = branch
    } else if (branch) {
      await GitService.checkout(targetPath, branch)
      currentBranch = branch
    } else {
      currentBranch = await GitService.getCurrentBranch(targetPath).catch(() => undefined)
    }

    await this.applyProjectSetup(name, targetPath)

    return { name, path: targetPath, branch: currentBranch, isGitRepo: true }
  }

  private async applyProjectSetup(projectName: string, clonePath: string): Promise<void> {
    const setupDir = join(PROJECT_SETUP_DIR, projectName, 'files')
    if (!existsSync(setupDir)) return
    try {
      const { cp } = await import('node:fs/promises')
      await cp(setupDir, clonePath, { recursive: true, force: false })
    } catch {}
  }

  async scanChatProjects(chatId: string): Promise<void> {
    const chat = this.getChat(chatId)
    if (!chat?.dirPath) return
    const projects = await scanProjects(chat.dirPath)
    this.updateChat(chatId, { projects })
  }

  cleanup(): void {
    for (const timer of this.idleTimers.values()) clearTimeout(timer)
    this.idleTimers.clear()
  }

  // ── Chat lifecycle ──

  async createChat(opts: CreateChatOpts): Promise<{ chat: ChatRecord }> {
    const chatId = crypto.randomUUID().slice(0, 8)
    const now = Date.now()
    const llmCommand = this.resolveLlmCommand(opts.llmCommand)
    const dirPath = await createChatDir(chatId)

    let projects: ProjectInfo[] = []
    let ptyId: string
    try {
      await copySkillsToChat(dirPath)

      if (opts.project) {
        const project = await this.cloneProject(dirPath, opts.project.pathOrUrl, opts.project.branch, opts.project.base)
        projects = [project]
      }

      await writeAgentsMd(dirPath, projects, this.settingsGetter().projectRoots)
      await generateCliConfig(dirPath, resolveCliType(llmCommand), llmCommand)

      const env: Record<string, string> = { PARLOUR_CHAT_ID: chatId, ...this.themeEnv() }
      const command = this.buildShellCommand(llmCommand, [])
      ptyId = await this.ptyManager.create(dirPath, undefined, command, undefined, env)
    } catch (err) {
      await rm(dirPath, { recursive: true, force: true }).catch(() => {})
      throw err
    }

    this.registerExitHandler(chatId, ptyId, opts.onExit)
    this.registerActivityHandler(chatId, ptyId)
    this.attachHarnessTracking(chatId, ptyId, llmCommand)

    if (opts.prompt) {
      this.ptyManager.writeWhenReady(ptyId, opts.prompt).then(() => {
        lifecycle.emit({ type: 'pty:prompt-delivered', ptyId, chatId })
      }).catch((err) => {
        lifecycle.emit({ type: 'pty:prompt-failed', ptyId, chatId, error: err.message })
        log.error('Prompt delivery failed', { chatId, error: err.message })
        this.updateChat(chatId, { status: 'failed' as ChatStatus })
      })
    }

    const chat: ChatRecord = {
      id: chatId,
      name: opts.name ?? (projects.length > 0 ? projects[0].name : 'New Chat'),
      status: 'active',
      ptyId,
      dirPath,
      createdAt: now,
      lastActiveAt: now,
      pinnedAt: null,
      llmCommand,
      projects,
    }

    this.chats.push(chat)
    this.persistChat(chat)
    this.pushToRenderer()
    lifecycle.emit({ type: 'chat:created', chatId, name: chat.name })
    lifecycle.emit({ type: 'pty:spawned', ptyId, chatId })
    return { chat }
  }

  async createChildChat(parentId: string, opts: CreateChatOpts): Promise<{ chat: ChatRecord }> {
    const parent = this.getChat(parentId)
    if (!parent) throw new Error('Parent chat not found')

    const depth = this.getChatDepth(parentId)
    const maxDepth = this.settingsGetter().maxChatDepth
    if (depth >= maxDepth) {
      throw new Error(`Max nesting depth (${maxDepth}) reached`)
    }

    const chatId = crypto.randomUUID().slice(0, 8)
    const now = Date.now()
    const llmCommand = this.resolveLlmCommand(opts.llmCommand, parent.llmCommand)
    const dirPath = await createChatDir(chatId, parent.dirPath)
    await copySkillsToChat(dirPath)

    let projects: ProjectInfo[] = []
    if (opts.project) {
      const project = await this.cloneProject(dirPath, opts.project.pathOrUrl, opts.project.branch, opts.project.base)
      projects = [project]
    }

    await writeAgentsMd(dirPath, projects, this.settingsGetter().projectRoots)
    await generateCliConfig(dirPath, resolveCliType(llmCommand), llmCommand)

    if (parent.ptyId) {
      try {
        const summary = await this.summarizeContext(parent.ptyId)
        if (summary) {
          const { appendFile } = await import('node:fs/promises')
          await appendFile(join(dirPath, 'AGENTS.md'), `\n\n## Parent Context\n\n${summary}\n`, 'utf-8')
        }
      } catch {}
    }

    const env: Record<string, string> = { PARLOUR_CHAT_ID: chatId, PARLOUR_PARENT_CHAT_ID: parentId, ...this.themeEnv() }
    const command = this.buildShellCommand(llmCommand, [])
    const ptyId = await this.ptyManager.create(dirPath, undefined, command, undefined, env)

    this.registerExitHandler(chatId, ptyId, opts.onExit)
    this.registerActivityHandler(chatId, ptyId)
    this.attachHarnessTracking(chatId, ptyId, llmCommand)

    if (opts.prompt) {
      this.ptyManager.writeWhenReady(ptyId, opts.prompt).then(() => {
        lifecycle.emit({ type: 'pty:prompt-delivered', ptyId, chatId })
      }).catch((err) => {
        lifecycle.emit({ type: 'pty:prompt-failed', ptyId, chatId, error: err.message })
        log.error('Prompt delivery failed', { chatId, parentId, error: err.message })
        this.updateChat(chatId, { status: 'failed' as ChatStatus })
      })
    }

    const chat: ChatRecord = {
      id: chatId,
      name: opts.name ?? (projects.length > 0 ? projects[0].name : 'New Chat'),
      status: 'active',
      ptyId,
      dirPath,
      createdAt: now,
      lastActiveAt: now,
      pinnedAt: null,
      parentId,
      llmCommand,
      projects,
    }

    this.chats.push(chat)
    this.persistChat(chat)
    this.pushToRenderer()
    lifecycle.emit({ type: 'chat:created', chatId, name: chat.name })
    lifecycle.emit({ type: 'pty:spawned', ptyId, chatId })
    return { chat }
  }

  async resumeChat(chatId: string): Promise<void> {
    const chat = this.getChat(chatId)
    if (!chat || chat.ptyId || !chat.dirPath) return

    if (!existsSync(chat.dirPath)) {
      this.updateChat(chatId, { status: 'error' })
      return
    }

    const llmCommand = this.resolveLlmCommand(chat.llmCommand)
    const env: Record<string, string> = { PARLOUR_CHAT_ID: chatId, ...this.themeEnv() }

    const resumeArgs = getResumeArgs(resolveCliType(llmCommand))

    const command = this.buildShellCommand(llmCommand, resumeArgs)
    const ptyId = await this.ptyManager.create(chat.dirPath, undefined, command, undefined, env)

    let savedBuf: string | undefined
    try { savedBuf = await readFile(join(chat.dirPath, 'terminal-buffer'), 'utf-8') } catch {}
    if (savedBuf) this.ptyManager.seedBuffer(ptyId, savedBuf)

    this.registerExitHandler(chatId, ptyId)
    this.registerActivityHandler(chatId, ptyId)
    this.attachHarnessTracking(chatId, ptyId, llmCommand)

    this.updateChatInternal(chatId, { ptyId, status: 'active' })
    const updated = this.getChat(chatId)
    if (updated) this.persistChat(updated)
    this.pushToRenderer()
    lifecycle.emit({ type: 'chat:resumed', chatId, ptyId })
    lifecycle.emit({ type: 'pty:spawned', ptyId, chatId })
  }

  async deleteChat(chatId: string): Promise<void> {
    const idsToRemove = new Set<string>()
    const collect = (pid: string) => {
      for (const c of this.chats) {
        if (c.parentId === pid && !idsToRemove.has(c.id)) {
          idsToRemove.add(c.id)
          collect(c.id)
        }
      }
    }
    idsToRemove.add(chatId)
    collect(chatId)

    for (const cid of idsToRemove) {
      const chat = this.getChat(cid)
      if (!chat) continue
      if (chat.ptyId) this.ptyManager.destroy(chat.ptyId)
      if (chat.dirPath) await rm(chat.dirPath, { recursive: true, force: true }).catch(() => {})
    }

    this.chats = this.chats.filter((c) => !idsToRemove.has(c.id))
    this.pushToRenderer()
    for (const cid of idsToRemove) {
      lifecycle.emit({ type: 'chat:deleted', chatId: cid })
    }
  }

  async retitleChat(chatId: string): Promise<void> {
    const chat = this.getChat(chatId)
    if (!chat?.ptyId) return

    const buffer = this.ptyManager.getBuffer(chat.ptyId)
    if (!buffer) return

    const tail = buffer.slice(-4000)
    const llmCommand = this.resolveLlmCommand(chat.llmCommand)
    const title = await this.generateTitle(tail, llmCommand)
    if (title) {
      this.updateChat(chatId, { name: title })
    }
  }

  // ── Persistence (per-chat metadata.json) ──

  async loadFromDisk(): Promise<void> {
    const chatsDir = join(PARLOUR_DIR, 'chats')
    let entries: string[]
    try {
      entries = await readdir(chatsDir)
    } catch {
      return
    }

    const loaded: ChatRecord[] = []
    for (const name of entries) {
      if (name.startsWith('.')) continue
      const dirPath = join(chatsDir, name)
      let s: Awaited<ReturnType<typeof stat>>
      try {
        s = await stat(dirPath)
        if (!s.isDirectory()) continue
      } catch {
        continue
      }

      try {
        const raw = await readFile(join(dirPath, 'metadata.json'), 'utf-8')
        const meta = JSON.parse(raw) as Partial<ChatRecord>
        loaded.push({
          id: name,
          name: meta.name ?? 'Chat',
          status: 'done',
          ptyId: null,
          dirPath,
          createdAt: meta.createdAt ?? s.birthtimeMs ?? s.mtimeMs,
          lastActiveAt: meta.lastActiveAt ?? s.mtimeMs,
          pinnedAt: meta.pinnedAt ?? null,
          parentId: meta.parentId,
          llmCommand: meta.llmCommand,
          projects: meta.projects,
        })
      } catch {
        loaded.push({
          id: name,
          name: 'Recovered Chat',
          status: 'done',
          ptyId: null,
          dirPath,
          createdAt: s.birthtimeMs ?? s.mtimeMs,
          lastActiveAt: s.mtimeMs,
          pinnedAt: null,
        })
      }
    }

    if (loaded.length > 0) {
      log.info('Loaded chats from disk', { count: loaded.length })
      this.chats = loaded
    }
  }

  reconcilePtys(): void {
    const orphaned = this.chats.filter((c) => !existsSync(c.dirPath))
    if (orphaned.length > 0) {
      log.warn('Pruning chats with missing dirs', { count: orphaned.length })
      this.chats = this.chats.filter((c) => existsSync(c.dirPath))
    }

    const livePtyIds = new Set(this.ptyManager.list())

    for (const chat of this.chats) {
      if (chat.ptyId && livePtyIds.has(chat.ptyId)) {
        this.registerExitHandler(chat.id, chat.ptyId)
        this.registerActivityHandler(chat.id, chat.ptyId)
      } else if (chat.ptyId && !livePtyIds.has(chat.ptyId)) {
        chat.ptyId = null
        chat.status = 'done'
      } else if (!chat.ptyId && (chat.status === 'active' || chat.status === 'idle')) {
        chat.status = 'done'
      }
    }
  }

  getHarnessState(chatId: string): import('./harness-tracker').HarnessState | undefined {
    return this.harnessTrackers.get(chatId)?.getState()
  }

  // ── Internal helpers ──

  private attachHarnessTracking(chatId: string, ptyId: string, llmCommand: string): void {
    const tracker = new HarnessTracker(chatId)
    this.harnessTrackers.set(chatId, tracker)

    const cliType = resolveCliType(llmCommand)
    const parser = createParser(cliType)

    this.ptyManager.onOutput(ptyId, (_id, data) => {
      const events = parser.feed(chatId, data)
      for (const event of events) {
        lifecycle.emit(event)
        tracker.handleEvent(event)
      }
    })

    lifecycle.on('harness:*', (event) => {
      const he = event as HarnessEvent
      if ('chatId' in he && he.chatId === chatId) {
        tracker.handleEvent(he)
      }
    })
  }

  private updateChatInternal(id: string, partial: Partial<ChatRecord>): void {
    const idx = this.chats.findIndex((c) => c.id === id)
    if (idx === -1) return
    this.chats[idx] = { ...this.chats[idx], ...partial }
  }

  private registerActivityHandler(chatId: string, ptyId: string): void {
    this.ptyManager.onActivity(ptyId, () => {
      const chat = this.getChat(chatId)
      if (!chat || chat.ptyId !== ptyId) return

      if (chat.status === 'idle') {
        this.updateChatInternal(chatId, { status: 'active' })
        this.pushToRenderer()
      }

      this.resetIdleTimer(chatId)
    })
    this.resetIdleTimer(chatId)
  }

  private resetIdleTimer(chatId: string): void {
    const existing = this.idleTimers.get(chatId)
    if (existing) clearTimeout(existing)

    this.idleTimers.set(chatId, setTimeout(() => {
      const chat = this.getChat(chatId)
      if (!chat?.ptyId || chat.status === 'done' || chat.status === 'error') return
      this.updateChatInternal(chatId, { status: 'idle' })
      const idled = this.getChat(chatId)
      if (idled) this.persistChat(idled)
      this.pushToRenderer()
    }, ChatRegistry.IDLE_THRESHOLD))
  }

  private clearIdleTimer(chatId: string): void {
    const timer = this.idleTimers.get(chatId)
    if (timer) {
      clearTimeout(timer)
      this.idleTimers.delete(chatId)
    }
  }

  private registerExitHandler(chatId: string, ptyId: string, onExit?: (exitCode: number) => void): void {
    this.ptyManager.onExit(ptyId, (exitCode) => {
      const chat = this.getChat(chatId)
      if (!chat || chat.ptyId !== ptyId) return

      this.clearIdleTimer(chatId)
      const tracker = this.harnessTrackers.get(chatId)
      if (tracker) {
        exitCode === 0 ? tracker.markDone() : tracker.markError()
      }
      const buf = this.ptyManager.getBuffer(ptyId)
      if (buf && chat.dirPath) {
        mkdir(chat.dirPath, { recursive: true }).then(() =>
          writeFile(join(chat.dirPath, 'terminal-buffer'), buf, 'utf-8'),
        ).catch(() => {})
      }

      this.updateChatInternal(chatId, {
        ptyId: null,
        status: exitCode === 0 ? 'done' : 'error',
      })

      if (chat.parentId) {
        const parent = this.getChat(chat.parentId)
        if (parent?.ptyId) {
          const status = exitCode === 0 ? 'done' : 'failed'
          this.ptyManager.write(parent.ptyId, `\r\n--- Subtask "${chat.name}" ${status} ---\r\n`)
        }
      }

      const newStatus = exitCode === 0 ? 'done' : 'error'
      lifecycle.emit({ type: 'pty:exit', ptyId, chatId, exitCode })
      lifecycle.emit({ type: 'chat:status', chatId, from: chat.status as ChatStatus, to: newStatus as ChatStatus })

      onExit?.(exitCode)
      const exited = this.getChat(chatId)
      if (exited) this.persistChat(exited)
      this.pushToRenderer()
    })
  }

  private resolveFromRoots(absPath: string): string | null {
    const name = basename(absPath)
    for (const root of this.settingsGetter().projectRoots) {
      const expanded = root.replace(/^~/, homedir())
      const candidate = join(expanded, name)
      if (existsSync(candidate)) return candidate
    }
    return null
  }

  private resolveLlmCommand(...overrides: (string | undefined | null)[]): string {
    for (const o of overrides) {
      if (o) return o
    }
    return this.settingsGetter().llmCommand || 'claude'
  }

  private buildShellCommand(llmCommand: string, args: string[]): string[] {
    if (args.length === 0) return ['/bin/sh', '-c', `exec ${llmCommand}`]
    const escaped = args.map((a) => `'${a}'`)
    return ['/bin/sh', '-c', `exec ${llmCommand} ${escaped.join(' ')}`]
  }

  private async summarizeContext(ptyId: string): Promise<string | null> {
    const buffer = this.ptyManager.getBuffer(ptyId)
    const tail = buffer.length > 8000 ? buffer.slice(-8000) : buffer
    if (!tail.trim()) return null
    try {
      const { stdout } = await execAsync('claude', [
        '-p', `Summarize the following terminal session into a concise context paragraph for a sub-agent. Focus on: what task is being worked on, key decisions made, current state. No preamble.\n\n${tail}`,
        '--max-turns', '0',
      ], { timeout: 30000 })
      return stdout.trim() || null
    } catch {
      return null
    }
  }

  private async generateTitle(text: string, llmCommand: string): Promise<string | null> {
    const cmd = llmCommand || 'claude'
    try {
      const { stdout } = await execAsync(cmd, [
        '-p', `Give a 3-5 word title for this chat. No quotes, no punctuation, no prefix. Just the title words:\n\n${text}`,
        '--max-turns', '0',
      ], { timeout: 15000 })
      const title = stdout.trim()
        .replace(/^["'`\-–—*#•>\s]+/, '')
        .replace(/["'`\s]+$/, '')
        .replace(/\b\w/g, (c) => c.toUpperCase())
      return title || null
    } catch {
      return null
    }
  }

  flushPersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }

    for (const chat of this.chats) {
      if (!chat.ptyId) continue
      const buf = this.ptyManager.getBuffer(chat.ptyId)
      if (buf && chat.dirPath) {
        try {
          mkdirSync(chat.dirPath, { recursive: true })
          writeFileSync(join(chat.dirPath, 'terminal-buffer'), buf, 'utf-8')
        } catch {}
      }
      chat.ptyId = null
      chat.status = 'done'
      this.persistChatSync(chat)
    }
  }

  private persistChat(chat: ChatRecord): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      this.writeChatMetadata(chat).catch((err) => {
        log.error('Failed to persist chat metadata', { chatId: chat.id, error: String(err) })
      })
    }, 500)
  }

  private async writeChatMetadata(chat: ChatRecord): Promise<void> {
    if (!chat.dirPath) return
    await mkdir(chat.dirPath, { recursive: true })
    const meta = {
      name: chat.name,
      createdAt: chat.createdAt,
      lastActiveAt: chat.lastActiveAt,
      pinnedAt: chat.pinnedAt,
      parentId: chat.parentId,
      llmCommand: chat.llmCommand,
      projects: chat.projects,
    }
    await writeFile(join(chat.dirPath, 'metadata.json'), JSON.stringify(meta, null, 2), 'utf-8')
  }

  private persistChatSync(chat: ChatRecord): void {
    if (!chat.dirPath) return
    try {
      mkdirSync(chat.dirPath, { recursive: true })
      const meta = {
        name: chat.name, createdAt: chat.createdAt, lastActiveAt: chat.lastActiveAt,
        pinnedAt: chat.pinnedAt, parentId: chat.parentId, llmCommand: chat.llmCommand,
      }
      writeFileSync(join(chat.dirPath, 'metadata.json'), JSON.stringify(meta, null, 2), 'utf-8')
    } catch (err) {
      log.error('Failed to persist chat metadata', { chatId: chat.id, error: String(err) })
    }
  }

  addStateListener(cb: (state: { chats: ChatRecord[] }) => void): () => void {
    this.stateListeners.push(cb)
    return () => {
      const idx = this.stateListeners.indexOf(cb)
      if (idx >= 0) this.stateListeners.splice(idx, 1)
    }
  }

  private pushToRenderer(): void {
    const state = { chats: this.chats }
    this.onStateChanged(state)
    for (const cb of this.stateListeners) cb(state)
  }
}
