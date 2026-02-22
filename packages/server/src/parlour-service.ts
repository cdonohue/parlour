import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { access, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { PtyManager } from './pty-manager'
import { TaskScheduler, type Schedule } from './task-scheduler'
import { ChatRegistry, type CreateChatOpts } from './chat-registry'
import { GitService, type FileStatus, type FileDiff } from './git-service'
import { ForgeService } from './forge-service'
import { FileService } from './file-service'
import { ThemeManager } from './theme-manager'
import {
  PARLOUR_DIR, createChatDir, writeAgentsMd, scanProjects, getClaudeSessionId,
} from './parlour-dirs'
import { detectInstalledClis } from './cli-detect'
import { getCliBaseDefaults } from './cli-config'
import { loadJsonFile, saveJsonFile } from './claude-config'
import { logger as rootLogger } from './logger'
import { lifecycle } from './lifecycle'

const log = rootLogger.child({ service: 'ParlourService' })
const execAsync = promisify(execFile)

function deriveShortTitle(prompt: string): string {
  let text = prompt.trim().replace(/^(?:please\s+|can you\s+|i need you to\s+|could you\s+|i want you to\s+)/i, '')
  if (!text) return prompt.slice(0, 50)
  const m = /[.,;:\n]/.exec(text)
  if (m && m.index > 0 && m.index <= 50) text = text.slice(0, m.index)
  else if (text.length > 50) {
    const sp = text.lastIndexOf(' ', 50)
    text = text.slice(0, sp > 20 ? sp : 50)
  }
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const KNOWN_OPENERS = [
  { id: 'finder', name: 'Finder', cmd: 'open' },
  { id: 'terminal', name: 'Terminal', cmd: 'open', args: ['-a', 'Terminal'] },
  { id: 'iterm', name: 'iTerm', app: 'iTerm.app' },
  { id: 'warp', name: 'Warp', app: 'Warp.app' },
  { id: 'ghostty', name: 'Ghostty', app: 'Ghostty.app' },
  { id: 'vscode', name: 'VS Code', cli: 'code' },
  { id: 'cursor', name: 'Cursor', cli: 'cursor' },
  { id: 'zed', name: 'Zed', cli: 'zed' },
  { id: 'sublime', name: 'Sublime Text', cli: 'subl' },
  { id: 'webstorm', name: 'WebStorm', cli: 'webstorm' },
  { id: 'idea', name: 'IntelliJ IDEA', cli: 'idea' },
  { id: 'nova', name: 'Nova', cli: 'nova' },
] as const

export class ParlourService {
  private cachedOpeners: Array<{ id: string; name: string }> | null = null

  constructor(
    private chatRegistry: ChatRegistry,
    private ptyManager: PtyManager,
    private taskScheduler: TaskScheduler,
    private settingsGetter: () => { llmCommand: string; projectRoots: string[] },
    private themeManager: ThemeManager,
    private stateFilePath: string,
  ) {}

  // ── Dispatch / Status ──

  async dispatch(
    prompt: string,
    opts?: { parentId?: string; llm?: string; project?: string; branch?: string },
  ): Promise<{ chatId: string; chatDir: string }> {
    const chatOpts = {
      name: 'New Chat',
      llmCommand: opts?.llm ?? this.settingsGetter().llmCommand,
      prompt,
      background: true,
      project: opts?.project ? { pathOrUrl: opts.project, branch: opts.branch } : undefined,
    }
    const result = opts?.parentId
      ? await this.chatRegistry.createChildChat(opts.parentId, chatOpts)
      : await this.chatRegistry.createChat(chatOpts)

    log.info('dispatch', { chatId: result.chat.id, parentId: opts?.parentId })
    return { chatId: result.chat.id, chatDir: result.chat.dirPath }
  }

  getStatus(chatId: string): { status: string; name: string; harness: unknown; output: string } | null {
    const chat = this.chatRegistry.getChat(chatId)
    if (!chat) return null
    const buffer = chat.ptyId ? this.ptyManager.getBuffer(chat.ptyId) : ''
    const tail = buffer.length > 4000 ? buffer.slice(-4000) : buffer
    const harness = this.chatRegistry.getHarnessState(chatId)
    return { status: chat.status, name: chat.name, harness, output: tail }
  }

  getChildren(parentId: string): Array<{ id: string; name: string; status: string }> {
    return this.chatRegistry.getChildren(parentId).map((c) => ({ id: c.id, name: c.name, status: c.status }))
  }

  report(chatId: string, parentId: string, message: string): boolean {
    const parent = this.chatRegistry.getChat(parentId)
    if (!parent?.ptyId) return false
    this.ptyManager.write(parent.ptyId, `\r\n${message}\r\n`)
    return true
  }

  async send(chatId: string, targetId: string, message: string): Promise<boolean> {
    const target = this.chatRegistry.getChat(targetId)
    if (!target) return false

    if (!target.ptyId) {
      await this.chatRegistry.resumeChat(targetId)
      const resumed = this.chatRegistry.getChat(targetId)
      if (!resumed?.ptyId) return false
      const bracketed = `\x1b[200~${message}\x1b[201~`
      await this.ptyManager.writeWhenReady(resumed.ptyId, bracketed, false)
      setTimeout(() => this.ptyManager.write(resumed.ptyId!, '\r'), 500)
      return true
    }

    const bracketed = `\x1b[200~${message}\x1b[201~`
    this.ptyManager.write(target.ptyId, bracketed)
    setTimeout(() => this.ptyManager.write(target.ptyId!, '\r'), 500)
    return true
  }

  // ── Schedules ──

  listSchedules(): Array<{
    id: string; name: string; prompt: string; trigger: unknown
    enabled: boolean; lastRunAt: number | undefined; lastRunStatus: string | undefined
  }> {
    return this.taskScheduler.list().map((s) => ({
      id: s.id, name: s.name, prompt: s.prompt, trigger: s.trigger,
      enabled: s.enabled, lastRunAt: s.lastRunAt, lastRunStatus: s.lastRunStatus,
    }))
  }

  createSchedule(opts: {
    prompt: string; cron?: string; at?: string; createdBy?: string
  }): { id: string; name: string } {
    const trigger = opts.cron
      ? { type: 'cron' as const, cron: opts.cron }
      : { type: 'once' as const, at: opts.at! }
    const schedule = this.taskScheduler.create({
      name: deriveShortTitle(opts.prompt),
      prompt: opts.prompt, trigger, createdBy: opts.createdBy,
    })
    return { id: schedule.id, name: schedule.name }
  }

  cancelSchedule(id: string): void {
    this.taskScheduler.delete(id)
  }

  runSchedule(id: string): void {
    this.taskScheduler.runNow(id)
  }

  toggleSchedule(id: string): boolean {
    return this.taskScheduler.toggle(id)
  }

  updateSchedule(id: string, partial: {
    name?: string; prompt?: string; project?: string
    trigger?: Schedule['trigger']; llmCommand?: string
  }): void {
    this.taskScheduler.update(id, partial)
  }

  // ── Projects ──

  async listProjects(chatId: string): Promise<Array<{ name: string; path: string; branch?: string }>> {
    const chat = this.chatRegistry.getChat(chatId)
    if (!chat?.dirPath) return []
    const projects = await scanProjects(chat.dirPath)
    return projects.map((p) => ({ name: p.name, path: p.path, branch: p.branch }))
  }

  async openProject(
    chatId: string, pathOrUrl: string, branch?: string, base?: string,
  ): Promise<{ name: string; path: string; branch?: string } | null> {
    const chat = this.chatRegistry.getChat(chatId)
    if (!chat?.dirPath) return null
    const project = await this.chatRegistry.cloneProject(chat.dirPath, pathOrUrl, branch, base)
    await this.chatRegistry.scanChatProjects(chatId)
    const projects = await scanProjects(chat.dirPath)
    await writeAgentsMd(chat.dirPath, projects, this.settingsGetter().projectRoots)
    return { name: project.name, path: project.path, branch: project.branch }
  }

  // ── PTY ──

  getPtyIdForChat(chatId: string): string | undefined {
    return this.chatRegistry.getChat(chatId)?.ptyId ?? undefined
  }

  onPtyOutput(ptyId: string, callback: (ptyId: string, data: string) => void): () => void {
    return this.ptyManager.onOutput(ptyId, callback)
  }

  writePty(ptyId: string, data: string): void {
    this.ptyManager.write(ptyId, data)
  }

  resizePty(ptyId: string, cols: number, rows: number): void {
    this.ptyManager.resize(ptyId, cols, rows)
  }

  getPtyBuffer(ptyId: string): string {
    return this.ptyManager.getBuffer(ptyId)
  }

  onPtyTitle(ptyId: string, callback: (ptyId: string, title: string) => void): () => void {
    return this.ptyManager.onTitle(ptyId, callback)
  }

  onPtyExit(ptyId: string, callback: (exitCode: number) => void): () => void {
    return this.ptyManager.onExit(ptyId, callback)
  }

  onPtyFirstInput(ptyId: string, callback: (ptyId: string, input: string) => void): () => void {
    return this.ptyManager.onFirstInput(ptyId, callback)
  }

  async createPty(workingDir: string, shell?: string, command?: string[], extraEnv?: Record<string, string>): Promise<string> {
    return this.ptyManager.create(workingDir, shell, command, undefined, extraEnv)
  }

  destroyPty(ptyId: string): void {
    this.ptyManager.destroy(ptyId)
  }

  listPtys(): string[] {
    return this.ptyManager.list()
  }

  // ── Hooks ──

  handleHook(chatId: string, event: string, data?: Record<string, unknown>): void {
    lifecycle.emit({ type: 'cli:hook', chatId, event, data })

    if (event === 'pre-tool-use' && data?.tool) {
      lifecycle.emit({ type: 'harness:tool:start', chatId, tool: data.tool as string })
    } else if (event === 'post-tool-use' && data?.tool) {
      lifecycle.emit({ type: 'harness:tool:end', chatId, tool: data.tool as string })
    } else if (event === 'stop') {
      lifecycle.emit({ type: 'harness:stop', chatId, reason: data?.reason as string | undefined, lastMessage: data?.last_assistant_message as string | undefined })
    }
  }

  // ── Git ──

  async gitStatus(repoPath: string): Promise<FileStatus[]> {
    return GitService.getStatus(repoPath)
  }

  async gitDiff(repoPath: string, staged: boolean): Promise<FileDiff[]> {
    return GitService.getDiff(repoPath, staged)
  }

  async gitFileDiff(repoPath: string, filePath: string): Promise<string> {
    return GitService.getFileDiff(repoPath, filePath)
  }

  async gitBranches(repoPath: string): Promise<string[]> {
    return GitService.getBranches(repoPath)
  }

  async gitStage(repoPath: string, paths: string[]): Promise<void> {
    return GitService.stage(repoPath, paths)
  }

  async gitUnstage(repoPath: string, paths: string[]): Promise<void> {
    return GitService.unstage(repoPath, paths)
  }

  async gitDiscard(repoPath: string, paths: string[], untracked: string[]): Promise<void> {
    return GitService.discard(repoPath, paths, untracked)
  }

  async gitCommit(repoPath: string, message: string): Promise<void> {
    return GitService.commit(repoPath, message)
  }

  async gitCurrentBranch(repoPath: string): Promise<string> {
    return GitService.getCurrentBranch(repoPath)
  }

  async gitIsRepo(dirPath: string): Promise<boolean> {
    return GitService.isGitRepo(dirPath)
  }

  async gitParentBranch(repoPath: string, branch: string): Promise<string> {
    return GitService.getParentBranch(repoPath, branch)
  }

  async gitCloneBare(url: string, targetDir: string): Promise<string> {
    return GitService.cloneBare(url, targetDir)
  }

  // ── File ──

  async readFile(filePath: string): Promise<string | null> {
    return FileService.readFile(filePath)
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    return FileService.writeFile(filePath, content)
  }

  // ── GitHub / Forge ──

  async getPrStatuses(repoPath: string, branches: string[]): Promise<unknown> {
    return ForgeService.getPrStatuses(repoPath, branches)
  }

  // ── CLI ──

  async detectClis(): Promise<string[]> {
    return detectInstalledClis()
  }

  getCliBaseDefaults(): Record<string, string> {
    return getCliBaseDefaults()
  }

  // ── Shell ──

  async runCommand(command: string, cwd: string): Promise<{ success: boolean; output: string }> {
    try {
      const env = { ...process.env }
      delete env.CLAUDECODE
      const { stdout, stderr } = await execAsync('/bin/sh', ['-c', command], { cwd, timeout: 120000, env })
      return { success: true, output: stdout || stderr }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, output: msg }
    }
  }

  async openExternal(url: string): Promise<void> {
    execFile('open', [url], () => {})
  }

  // ── Chat workspace ──

  async createChatDir(chatId: string, parentDirPath?: string): Promise<string> {
    return createChatDir(chatId, parentDirPath)
  }

  async removeChatDir(chatId: string): Promise<void> {
    const chatDir = join(PARLOUR_DIR, 'chats', chatId)
    await rm(chatDir, { recursive: true, force: true })
  }

  async writeAgentsMd(chatDir: string): Promise<void> {
    await writeAgentsMd(chatDir)
  }

  async generateTitle(prompt: string, llmCommand?: string): Promise<string | null> {
    const cmd = llmCommand ?? 'claude'
    try {
      const { stdout } = await execAsync(cmd, [
        '-p', `Give a 3-5 word title for this chat. No quotes, no punctuation, no prefix. Just the title words:\n\n${prompt}`,
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

  async summarizeContext(ptyId: string): Promise<string | null> {
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

  notifyParent(parentPtyId: string, message: string): void {
    this.ptyManager.write(parentPtyId, `\r\n${message}\r\n`)
  }

  async getSessionId(chatDir: string): Promise<string | null> {
    return getClaudeSessionId(chatDir)
  }

  // ── Chat registry ──

  getRegistryState(): { chats: unknown[] } {
    return this.chatRegistry.getState()
  }

  updateChat(id: string, partial: Record<string, unknown>): void {
    this.chatRegistry.updateChat(id, partial)
  }

  async createChat(opts: CreateChatOpts): Promise<unknown> {
    return this.chatRegistry.createChat(opts)
  }

  async createChildChat(parentId: string, opts: CreateChatOpts): Promise<unknown> {
    return this.chatRegistry.createChildChat(parentId, opts)
  }

  async resumeChat(chatId: string): Promise<void> {
    return this.chatRegistry.resumeChat(chatId)
  }

  async deleteChat(chatId: string): Promise<void> {
    return this.chatRegistry.deleteChat(chatId)
  }

  async retitleChat(chatId: string): Promise<void> {
    return this.chatRegistry.retitleChat(chatId)
  }

  // ── State persistence ──

  async saveState(data: unknown): Promise<void> {
    await saveJsonFile(this.stateFilePath, data)
  }

  async loadState(): Promise<unknown> {
    return loadJsonFile(this.stateFilePath, null)
  }

  // ── Theme ──

  setThemeMode(mode: 'system' | 'dark' | 'light'): void {
    this.themeManager.setMode(mode)
    if (mode !== 'system') this.themeManager.setResolved(mode)
  }

  setThemeResolved(resolved: 'dark' | 'light'): void {
    this.themeManager.setResolved(resolved)
  }

  getThemeResolved(): 'dark' | 'light' {
    return this.themeManager.getResolved()
  }

  onThemeChange(fn: (resolved: 'dark' | 'light') => void): () => void {
    return this.themeManager.onChange(fn)
  }

  // ── App ──

  getParlourPath(): string {
    return PARLOUR_DIR
  }

  async discoverOpeners(): Promise<Array<{ id: string; name: string }>> {
    if (this.cachedOpeners) return this.cachedOpeners

    const results: Array<{ id: string; name: string }> = []
    for (const opener of KNOWN_OPENERS) {
      if (opener.id === 'finder' || opener.id === 'terminal') {
        results.push({ id: opener.id, name: opener.name })
        continue
      }
      if ('cli' in opener) {
        try {
          await execAsync('which', [opener.cli])
          results.push({ id: opener.id, name: opener.name })
        } catch {}
      }
      if ('app' in opener) {
        try {
          await access(`/Applications/${opener.app}`)
          results.push({ id: opener.id, name: opener.name })
        } catch {}
      }
    }
    this.cachedOpeners = results
    return results
  }

  openIn(openerId: string, dirPath: string): void {
    const opener = KNOWN_OPENERS.find((o) => o.id === openerId)
    if (!opener) return

    if (opener.id === 'finder') {
      execFile('open', [dirPath], () => {})
    } else if ('args' in opener) {
      execFile('open', [...opener.args, dirPath], () => {})
    } else if ('cli' in opener) {
      execFile(opener.cli, [dirPath], () => {})
    } else if ('app' in opener) {
      execFile('open', ['-a', opener.app, dirPath], () => {})
    }
  }
}
