import { createServer, type Server as HttpServer } from 'node:http'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { PtyManager } from './pty-manager'
import { TaskScheduler } from './task-scheduler'
import { ChatRegistry } from './chat-registry'
import { PARLOUR_DIR, scanProjects, writeAgentsMd } from './parlour-dirs'
import { logger as rootLogger } from './logger'
import { lifecycle } from './lifecycle'
import type { IncomingMessage, ServerResponse } from 'node:http'

const log = rootLogger.child({ service: 'ApiServer' })

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

const PORT_FILE = join(PARLOUR_DIR, '.mcp-port')

export class ParlourMcpServer {
  private httpServer: HttpServer | null = null
  private ptyManager: PtyManager
  private chatRegistry: ChatRegistry
  private taskScheduler: TaskScheduler
  private port = 0
  private settingsGetter: () => { llmCommand: string; projectRoots: string[] }

  constructor(ptyManager: PtyManager, settingsGetter: () => { llmCommand: string; projectRoots: string[] }, taskScheduler: TaskScheduler, chatRegistry: ChatRegistry) {
    this.ptyManager = ptyManager
    this.settingsGetter = settingsGetter
    this.taskScheduler = taskScheduler
    this.chatRegistry = chatRegistry
  }

  private async readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const raw = Buffer.concat(chunks).toString('utf-8')
    if (!raw.trim()) return {}
    return JSON.parse(raw)
  }

  private json(res: ServerResponse, data: unknown, status = 200): void {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }

  private async handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const path = url.pathname.replace('/api', '')
    const caller = url.searchParams.get('caller') ?? undefined

    try {
      if (req.method === 'POST' && path === '/dispatch') {
        const body = await this.readBody(req)
        const prompt = body.prompt as string
        const parentId = (body.parent_chat_id as string) ?? caller
        const opts = {
          name: deriveShortTitle(prompt),
          llmCommand: (body.llm as string) ?? this.settingsGetter().llmCommand,
          prompt,
          background: true,
          project: body.project ? { pathOrUrl: body.project as string, branch: body.branch as string | undefined } : undefined,
        }
        const result = parentId
          ? await this.chatRegistry.createChildChat(parentId, opts)
          : await this.chatRegistry.createChat(opts)

        lifecycle.emit({ type: 'cli:dispatch', chatId: result.chat.id, parentId, prompt })
        this.json(res, { chatId: result.chat.id, chatDir: result.chat.dirPath })
        return
      }

      if (req.method === 'GET' && path.startsWith('/status/')) {
        const chatId = path.split('/')[2]
        const chat = this.chatRegistry.getChat(chatId)
        if (!chat) { this.json(res, { error: 'Chat not found' }, 404); return }
        const buffer = chat.ptyId ? this.ptyManager.getBuffer(chat.ptyId) : ''
        const tail = buffer.length > 4000 ? buffer.slice(-4000) : buffer
        lifecycle.emit({ type: 'cli:status', chatId: caller ?? chatId, queriedId: chatId })
        const harness = this.chatRegistry.getHarnessState(chatId)
        this.json(res, { status: chat.status, name: chat.name, harness, output: tail })
        return
      }

      if (req.method === 'GET' && path.startsWith('/children/')) {
        const parentId = path.split('/')[2]
        const children = this.chatRegistry.getChildren(parentId).map((c) => ({ id: c.id, name: c.name, status: c.status }))
        this.json(res, children)
        return
      }

      if (req.method === 'POST' && path === '/report') {
        const body = await this.readBody(req)
        const chatId = body.chat_id as string
        const parentId = body.parent_id as string
        const message = body.message as string
        const parent = this.chatRegistry.getChat(parentId)
        if (!parent?.ptyId) { this.json(res, { error: 'Parent not running' }, 400); return }
        this.ptyManager.write(parent.ptyId, `\r\n${message}\r\n`)
        lifecycle.emit({ type: 'cli:report', chatId, parentId })
        this.json(res, { ok: true })
        return
      }

      if (req.method === 'GET' && path === '/schedules') {
        const schedules = this.taskScheduler.list().map((s) => ({
          id: s.id, name: s.name, prompt: s.prompt, trigger: s.trigger,
          enabled: s.enabled, lastRunAt: s.lastRunAt, lastRunStatus: s.lastRunStatus,
        }))
        if (caller) lifecycle.emit({ type: 'cli:schedule', chatId: caller, action: 'list' })
        this.json(res, schedules)
        return
      }

      if (req.method === 'POST' && path === '/schedules') {
        const body = await this.readBody(req)
        const prompt = body.prompt as string
        const cron = body.cron as string | undefined
        const at = body.at as string | undefined
        if ((!cron && !at) || (cron && at)) { this.json(res, { error: 'Provide exactly one of cron or at' }, 400); return }
        const trigger = cron ? { type: 'cron' as const, cron } : { type: 'once' as const, at: at! }
        const schedule = this.taskScheduler.create({
          name: deriveShortTitle(prompt),
          prompt, trigger, createdBy: caller,
        })
        if (caller) lifecycle.emit({ type: 'cli:schedule', chatId: caller, action: 'create' })
        this.json(res, { id: schedule.id, name: schedule.name })
        return
      }

      if (req.method === 'POST' && path.match(/^\/schedules\/[^/]+$/)) {
        const id = path.split('/')[2]
        const body = await this.readBody(req)
        if (body.action === 'cancel') {
          this.taskScheduler.delete(id)
          if (caller) lifecycle.emit({ type: 'cli:schedule', chatId: caller, action: 'cancel' })
          this.json(res, { ok: true })
        }
        return
      }

      if (req.method === 'POST' && path.match(/^\/schedules\/[^/]+\/run$/)) {
        const id = path.split('/')[2]
        this.taskScheduler.runNow(id)
        if (caller) lifecycle.emit({ type: 'cli:schedule', chatId: caller, action: 'run' })
        this.json(res, { ok: true })
        return
      }

      if (req.method === 'GET' && path.startsWith('/projects/')) {
        const chatId = path.split('/')[2]
        const chat = this.chatRegistry.getChat(chatId)
        if (!chat?.dirPath) { this.json(res, []); return }
        const projects = await scanProjects(chat.dirPath)
        if (caller) lifecycle.emit({ type: 'cli:project', chatId: caller, action: 'list' })
        this.json(res, projects.map((p) => ({ name: p.name, path: p.path, branch: p.branch })))
        return
      }

      if (req.method === 'POST' && path === '/projects/open') {
        const body = await this.readBody(req)
        const chatId = body.chat_id as string
        const chat = this.chatRegistry.getChat(chatId)
        if (!chat?.dirPath) { this.json(res, { error: 'Chat not found' }, 404); return }
        const project = await this.chatRegistry.cloneProject(
          chat.dirPath, body.path_or_url as string, body.branch as string | undefined, body.base as string | undefined,
        )
        await this.chatRegistry.scanChatProjects(chatId)
        const projects = await scanProjects(chat.dirPath)
        await writeAgentsMd(chat.dirPath, projects, this.settingsGetter().projectRoots)
        if (caller) lifecycle.emit({ type: 'cli:project', chatId: caller, action: 'open' })
        this.json(res, { name: project.name, path: project.path, branch: project.branch })
        return
      }

      if (req.method === 'POST' && path === '/hooks') {
        const body = await this.readBody(req)
        const chatId = (body.chat_id as string) ?? caller ?? ''
        const event = body.event as string
        const data = (body.data as Record<string, unknown>) ?? {}

        lifecycle.emit({ type: 'cli:hook', chatId, event, data })

        if (event === 'pre-tool-use' && data.tool) {
          lifecycle.emit({ type: 'harness:tool:start', chatId, tool: data.tool as string })
        } else if (event === 'post-tool-use' && data.tool) {
          lifecycle.emit({ type: 'harness:tool:end', chatId, tool: data.tool as string })
        } else if (event === 'stop') {
          lifecycle.emit({ type: 'harness:stop', chatId, reason: data.reason as string | undefined })
        }

        this.json(res, { ok: true })
        return
      }

      this.json(res, { error: 'Not found' }, 404)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('API error', { path, error: msg })
      this.json(res, { error: msg }, 500)
    }
  }

  async start(): Promise<number> {
    await mkdir(PARLOUR_DIR, { recursive: true })

    this.httpServer = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      if (url.pathname.startsWith('/api/')) {
        await this.handleApi(req, res, url)
      } else if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok' }))
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    return new Promise((resolve, reject) => {
      this.httpServer!.listen(0, '127.0.0.1', async () => {
        const addr = this.httpServer!.address()
        if (!addr || typeof addr === 'string') {
          reject(new Error('Failed to get server address'))
          return
        }
        this.port = addr.port
        await writeFile(PORT_FILE, String(this.port), 'utf-8')
        log.info('API server listening', { port: this.port })
        resolve(this.port)
      })

      this.httpServer!.on('error', reject)
    })
  }

  getPort(): number {
    return this.port
  }

  async stop(): Promise<void> {
    if (this.httpServer) {
      return new Promise((resolve) => {
        this.httpServer!.close(() => resolve())
      })
    }
  }
}
