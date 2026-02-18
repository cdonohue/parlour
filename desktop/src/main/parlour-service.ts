import { PtyManager } from './pty-manager'
import { TaskScheduler } from './task-scheduler'
import { ChatRegistry } from './chat-registry'
import { scanProjects, writeAgentsMd } from './parlour-dirs'
import { logger as rootLogger } from './logger'
import { lifecycle } from './lifecycle'

const log = rootLogger.child({ service: 'ParlourService' })

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

export class ParlourService {
  constructor(
    private chatRegistry: ChatRegistry,
    private ptyManager: PtyManager,
    private taskScheduler: TaskScheduler,
    private settingsGetter: () => { llmCommand: string; projectRoots: string[] },
  ) {}

  async dispatch(
    prompt: string,
    opts?: { parentId?: string; llm?: string; project?: string; branch?: string },
  ): Promise<{ chatId: string; chatDir: string }> {
    const chatOpts = {
      name: deriveShortTitle(prompt),
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

  listSchedules(): Array<{
    id: string; name: string; prompt: string; trigger: unknown
    enabled: boolean; lastRunAt: string | null; lastRunStatus: string | null
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

  getPtyIdForChat(chatId: string): string | undefined {
    return this.chatRegistry.getChat(chatId)?.ptyId ?? undefined
  }

  onPtyOutput(ptyId: string, callback: (ptyId: string, data: string) => void): void {
    this.ptyManager.onOutput(ptyId, callback)
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

  onPtyTitle(ptyId: string, callback: (ptyId: string, title: string) => void): void {
    this.ptyManager.onTitle(ptyId, callback)
  }

  onPtyExit(ptyId: string, callback: (exitCode: number) => void): void {
    this.ptyManager.onExit(ptyId, callback)
  }

  handleHook(chatId: string, event: string, data?: Record<string, unknown>): void {
    lifecycle.emit({ type: 'cli:hook', chatId, event, data })

    if (event === 'pre-tool-use' && data?.tool) {
      lifecycle.emit({ type: 'harness:tool:start', chatId, tool: data.tool as string })
    } else if (event === 'post-tool-use' && data?.tool) {
      lifecycle.emit({ type: 'harness:tool:end', chatId, tool: data.tool as string })
    } else if (event === 'stop') {
      lifecycle.emit({ type: 'harness:stop', chatId, reason: data?.reason as string | undefined })
    }
  }
}
