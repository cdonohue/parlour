import { BrowserWindow } from 'electron'
import { join, basename, resolve } from 'node:path'
import { readFile, writeFile, mkdir, rm, symlink, lstat, readdir, stat } from 'node:fs/promises'
import { existsSync, writeFileSync, mkdirSync, renameSync, watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { IPC } from '../shared/ipc-channels'
import { PtyManager } from './pty-manager'
import { GitService } from './git-service'
import { loadJsonFile, saveJsonFile } from './claude-config'
import { PARLOUR_DIR, BARE_DIR, PROJECT_SETUP_DIR, createChatDir, writeAgentsMd, scanProjects, copySkillsToChat, ensureGlobalSkills } from './parlour-dirs'
import type { ProjectInfo } from './parlour-dirs'
import { generateCliConfig } from './cli-config'
import { resolveCliType, getResumeArgs } from './cli-detect'
import { ForgeService } from './forge-service'

const execAsync = promisify(execFile)

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
  private savedBuffers = new Map<string, string>()
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private branchWatchers = new Map<string, FSWatcher>()
  private branchDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private prPoller: ReturnType<typeof setInterval> | null = null
  private ptyManager: PtyManager
  private settingsGetter: () => { llmCommand: string; maxChatDepth: number; projectRoots: string[] }
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private registryFile: string

  constructor(
    ptyManager: PtyManager,
    settingsGetter: () => { llmCommand: string; maxChatDepth: number; projectRoots: string[] },
    dataDir: string,
  ) {
    this.ptyManager = ptyManager
    this.settingsGetter = settingsGetter
    this.registryFile = join(dataDir, 'chat-registry.json')
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
    this.schedulePersist()
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
    this.watchChatBranches(chatId)
    this.fetchPrForChat(chatId).catch(() => {})
  }

  private watchChatBranches(chatId: string): void {
    const chat = this.getChat(chatId)
    if (!chat?.projects) return

    for (const project of chat.projects) {
      if (!project.isGitRepo) continue
      const headPath = join(project.path, '.git', 'HEAD')
      const key = `${chatId}:${project.path}`
      if (this.branchWatchers.has(key)) continue
      if (!existsSync(headPath)) continue

      try {
        const watcher = watch(headPath, () => {
          const existing = this.branchDebounceTimers.get(key)
          if (existing) clearTimeout(existing)
          this.branchDebounceTimers.set(key, setTimeout(() => {
            this.branchDebounceTimers.delete(key)
            this.refreshProjectBranch(chatId, project.path)
          }, 200))
        })
        this.branchWatchers.set(key, watcher)
      } catch {}
    }
  }

  private async refreshProjectBranch(chatId: string, projectPath: string): Promise<void> {
    const chat = this.getChat(chatId)
    if (!chat?.projects) return

    try {
      const branch = await GitService.getCurrentBranch(projectPath)
      const project = chat.projects.find((p) => p.path === projectPath)
      if (project && project.branch !== branch) {
        this.updateChat(chatId, {
          projects: chat.projects.map((p) =>
            p.path === projectPath ? { ...p, branch, prInfo: undefined } : p,
          ),
        })
      }
    } catch {}

    this.fetchPrForChat(chatId).catch(() => {})
  }

  private unwatchChat(chatId: string): void {
    for (const [key, watcher] of this.branchWatchers) {
      if (key.startsWith(`${chatId}:`)) {
        watcher.close()
        this.branchWatchers.delete(key)
        const timer = this.branchDebounceTimers.get(key)
        if (timer) {
          clearTimeout(timer)
          this.branchDebounceTimers.delete(key)
        }
      }
    }
  }

  unwatchAll(): void {
    for (const watcher of this.branchWatchers.values()) watcher.close()
    this.branchWatchers.clear()
    for (const timer of this.branchDebounceTimers.values()) clearTimeout(timer)
    this.branchDebounceTimers.clear()
    this.stopPrPoller()
  }

  private async fetchPrForChat(chatId: string): Promise<void> {
    const chat = this.getChat(chatId)
    if (!chat?.projects) return

    for (const project of chat.projects) {
      if (!project.isGitRepo || !project.branch) continue
      const result = await ForgeService.getPrStatuses(project.path, [project.branch])
      if (!result.available) continue

      const prInfo = result.data[project.branch] ?? undefined
      const prev = chat.projects.find((p) => p.path === project.path)?.prInfo
      const changed = prev?.number !== prInfo?.number || prev?.checkStatus !== prInfo?.checkStatus || prev?.state !== prInfo?.state
      if (changed) {
        const fresh = this.getChat(chatId)
        if (!fresh?.projects) return
        this.updateChat(chatId, {
          projects: fresh.projects.map((p) =>
            p.path === project.path ? { ...p, prInfo } : p,
          ),
        })
      }
    }
  }

  startPrPoller(): void {
    if (this.prPoller) return
    this.prPoller = setInterval(() => {
      for (const chat of this.chats) {
        if (!chat.projects?.some((p) => p.isGitRepo && p.branch)) continue
        this.fetchPrForChat(chat.id).catch(() => {})
      }
    }, 60_000)
  }

  private stopPrPoller(): void {
    if (this.prPoller) {
      clearInterval(this.prPoller)
      this.prPoller = null
    }
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
      const mcpPort = await this.readMcpPort()
      if (mcpPort) {
        await generateCliConfig(dirPath, chatId, mcpPort, resolveCliType(llmCommand), llmCommand)
      }

      const env: Record<string, string> = { PARLOUR_CHAT_ID: chatId }
      const webContents = this.getWebContents()
      const command = this.buildShellCommand(llmCommand, [])
      ptyId = await this.ptyManager.create(dirPath, webContents, undefined, command, undefined, env)
    } catch (err) {
      await rm(dirPath, { recursive: true, force: true }).catch(() => {})
      throw err
    }

    this.registerExitHandler(chatId, ptyId, opts.onExit)
    this.registerActivityHandler(chatId, ptyId)

    if (opts.prompt) {
      this.ptyManager.writeWhenReady(ptyId, opts.prompt).catch((err) => {
        console.error(`[ChatRegistry] Prompt delivery failed for ${chatId}: ${err.message}`)
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
    this.watchChatBranches(chatId)
    this.schedulePersist()
    this.pushToRenderer()
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
    const mcpPort = await this.readMcpPort()
    if (mcpPort) {
      await generateCliConfig(dirPath, chatId, mcpPort, resolveCliType(llmCommand), llmCommand)
    }

    if (parent.ptyId) {
      try {
        const summary = await this.summarizeContext(parent.ptyId)
        if (summary) {
          const { appendFile } = await import('node:fs/promises')
          await appendFile(join(dirPath, 'AGENTS.md'), `\n\n## Parent Context\n\n${summary}\n`, 'utf-8')
        }
      } catch {}
    }

    const env: Record<string, string> = { PARLOUR_CHAT_ID: chatId, PARLOUR_PARENT_CHAT_ID: parentId }
    const webContents = this.getWebContents()
    const command = this.buildShellCommand(llmCommand, [])
    const ptyId = await this.ptyManager.create(dirPath, webContents, undefined, command, undefined, env)

    this.registerExitHandler(chatId, ptyId, opts.onExit)
    this.registerActivityHandler(chatId, ptyId)

    if (opts.prompt) {
      this.ptyManager.writeWhenReady(ptyId, opts.prompt).catch((err) => {
        console.error(`[ChatRegistry] Prompt delivery failed for child ${chatId}: ${err.message}`)
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
    this.watchChatBranches(chatId)
    this.schedulePersist()
    this.pushToRenderer()
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
    const env: Record<string, string> = { PARLOUR_CHAT_ID: chatId }

    const resumeArgs = getResumeArgs(resolveCliType(llmCommand))

    const webContents = this.getWebContents()
    const command = this.buildShellCommand(llmCommand, resumeArgs)
    const ptyId = await this.ptyManager.create(chat.dirPath, webContents, undefined, command, undefined, env)

    let savedBuf = this.savedBuffers.get(chatId)
    if (savedBuf) {
      this.savedBuffers.delete(chatId)
    } else {
      try { savedBuf = await readFile(join(chat.dirPath, 'terminal-buffer'), 'utf-8') } catch {}
    }
    if (savedBuf) this.ptyManager.seedBuffer(ptyId, savedBuf)

    this.registerExitHandler(chatId, ptyId)
    this.registerActivityHandler(chatId, ptyId)

    this.updateChatInternal(chatId, { ptyId, status: 'active' })
    this.schedulePersist()
    this.pushToRenderer()
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
      this.unwatchChat(cid)
      if (chat.ptyId) this.ptyManager.destroy(chat.ptyId)
      if (chat.dirPath) await rm(chat.dirPath, { recursive: true, force: true }).catch(() => {})
    }

    this.chats = this.chats.filter((c) => !idsToRemove.has(c.id))
    this.schedulePersist()
    this.pushToRenderer()
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

  // ── Persistence ──

  async loadFromDisk(): Promise<void> {
    try {
      const data = await loadJsonFile<{ chats?: ChatRecord[] }>(this.registryFile, {})
      if (data.chats?.length) {
        this.chats = data.chats
        return
      }
    } catch {}

    await this.recoverFromDirs()
  }

  private async recoverFromDirs(): Promise<void> {
    const chatsDir = join(PARLOUR_DIR, 'chats')
    let entries: string[]
    try {
      entries = await readdir(chatsDir)
    } catch {
      return
    }

    const recovered: ChatRecord[] = []
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

      const created = s.birthtimeMs || s.mtimeMs
      recovered.push({
        id: name,
        name: 'Recovered Chat',
        status: 'done',
        ptyId: null,
        dirPath,
        createdAt: created,
        lastActiveAt: created,
        pinnedAt: null,
      })
    }

    if (recovered.length > 0) {
      console.log(`[ChatRegistry] Recovered ${recovered.length} chats from disk`)
      this.chats = recovered
      this.schedulePersist()
    }
  }

  reconcilePtys(): void {
    const orphaned = this.chats.filter((c) => !existsSync(c.dirPath))
    if (orphaned.length > 0) {
      console.log(`[ChatRegistry] Pruning ${orphaned.length} chats with missing dirs`)
      const orphanIds = new Set(orphaned.map((c) => c.id))
      this.chats = this.chats.filter((c) => !orphanIds.has(c.id))
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

      if (chat.projects?.length) {
        this.watchChatBranches(chat.id)
      }
    }

    this.startPrPoller()
    this.persistSync()
  }

  // ── Internal helpers ──

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
      this.schedulePersist()
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
      const buf = this.ptyManager.getBuffer(ptyId)
      if (buf) {
        this.savedBuffers.set(chatId, buf)
        if (chat.dirPath) {
          mkdir(chat.dirPath, { recursive: true }).then(() =>
            writeFile(join(chat.dirPath, 'terminal-buffer'), buf, 'utf-8'),
          ).catch(() => {})
        }
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

      onExit?.(exitCode)
      this.schedulePersist()
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

  private getWebContents(): Electron.WebContents {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) throw new Error('No window available')
    return win.webContents
  }

  private async readMcpPort(): Promise<number | undefined> {
    try {
      const portStr = await readFile(join(PARLOUR_DIR, '.mcp-port'), 'utf-8')
      return parseInt(portStr, 10)
    } catch {
      return undefined
    }
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
    }

    this.persistSync()
  }

  private persistSync(): void {
    try {
      const tmp = this.registryFile + '.tmp'
      mkdirSync(join(this.registryFile, '..'), { recursive: true })
      writeFileSync(tmp, JSON.stringify({ chats: this.chats }, null, 2), 'utf-8')
      renameSync(tmp, this.registryFile)
    } catch (err) {
      console.error('Failed to persist chat registry:', err)
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => this.persist(), 500)
  }

  private async persist(): Promise<void> {
    try {
      await saveJsonFile(this.registryFile, { chats: this.chats })
    } catch (err) {
      console.error('Failed to persist chat registry:', err)
    }
  }

  private pushToRenderer(): void {
    const state = { chats: this.chats }
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.CHAT_REGISTRY_STATE_CHANGED, state)
      }
    }
  }
}
