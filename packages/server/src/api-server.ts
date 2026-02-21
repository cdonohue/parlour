import { createServer, type Server as HttpServer } from 'node:http'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { WebSocketServer, WebSocket } from 'ws'
import { PARLOUR_DIR } from './parlour-dirs'
import { logger as rootLogger } from './logger'
import { lifecycle } from './lifecycle'
import { ParlourService } from './parlour-service'
import type { ChatRegistry } from './chat-registry'
import type { TaskScheduler } from './task-scheduler'
import type { ClientMessage, ServerMessage } from '@parlour/api-types'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'

const log = rootLogger.child({ service: 'ApiServer' })
const PORT_FILE = join(PARLOUR_DIR, '.mcp-port')

interface WsClient {
  ws: WebSocket
  ptyUnsubs: Map<string, () => void>
  stateUnsub: (() => void) | null
  eventsUnsub: (() => void) | null
}

export class ApiServer {
  private httpServer: HttpServer | null = null
  private wss: WebSocketServer | null = null
  private port = 0
  private wsClients = new Set<WsClient>()
  private themeUnsub: (() => void) | null = null

  constructor(
    private service: ParlourService,
    private chatRegistry: ChatRegistry,
    private taskScheduler: TaskScheduler,
  ) {}

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  private broadcast(msg: ServerMessage): void {
    for (const client of this.wsClients) {
      this.send(client.ws, msg)
    }
  }

  private async readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const raw = Buffer.concat(chunks).toString('utf-8')
    if (!raw.trim()) return {}
    return JSON.parse(raw)
  }

  private static CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  } as const

  private json(res: ServerResponse, data: unknown, status = 200): void {
    res.writeHead(status, { 'Content-Type': 'application/json', ...ApiServer.CORS_HEADERS })
    res.end(JSON.stringify(data))
  }

  private extractParam(path: string, index: number): string {
    return decodeURIComponent(path.split('/')[index])
  }

  private async handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const path = url.pathname.replace('/api', '')
    const caller = url.searchParams.get('caller') ?? undefined
    const method = req.method ?? 'GET'

    if (method === 'OPTIONS') {
      res.writeHead(204, ApiServer.CORS_HEADERS)
      res.end()
      return
    }

    try {
      // ── Agent-facing routes ──

      if (method === 'POST' && path === '/dispatch') {
        const body = await this.readBody(req)
        const parentId = (body.parent_chat_id as string) ?? caller
        lifecycle.emit({ type: 'cli:dispatch', chatId: parentId ?? '', parentId, prompt: body.prompt as string })
        const result = await this.service.dispatch(body.prompt as string, {
          parentId, llm: body.llm as string | undefined,
          project: body.project as string | undefined, branch: body.branch as string | undefined,
        })
        this.json(res, result)
        return
      }

      if (method === 'GET' && path.startsWith('/status/')) {
        const chatId = this.extractParam(path, 2)
        if (caller) lifecycle.emit({ type: 'cli:status', chatId: caller, queriedId: chatId })
        const status = this.service.getStatus(chatId)
        if (!status) { this.json(res, { error: 'Chat not found' }, 404); return }
        this.json(res, status)
        return
      }

      if (method === 'GET' && path.startsWith('/children/')) {
        const parentId = this.extractParam(path, 2)
        this.json(res, this.service.getChildren(parentId))
        return
      }

      if (method === 'POST' && path === '/report') {
        const body = await this.readBody(req)
        const chatId = body.chat_id as string
        const parentId = body.parent_id as string
        const ok = this.service.report(chatId, parentId, body.message as string)
        if (!ok) { this.json(res, { error: 'Parent not running' }, 400); return }
        lifecycle.emit({ type: 'cli:report', chatId, parentId })
        this.json(res, { ok: true })
        return
      }

      if (method === 'GET' && path === '/schedules') {
        if (caller) lifecycle.emit({ type: 'cli:schedule', chatId: caller, action: 'list' })
        this.json(res, this.service.listSchedules())
        return
      }

      if (method === 'POST' && path === '/schedules') {
        const body = await this.readBody(req)
        const cron = body.cron as string | undefined
        const at = body.at as string | undefined
        if ((!cron && !at) || (cron && at)) { this.json(res, { error: 'Provide exactly one of cron or at' }, 400); return }
        if (caller) lifecycle.emit({ type: 'cli:schedule', chatId: caller, action: 'create' })
        const schedule = this.service.createSchedule({
          prompt: body.prompt as string, cron, at, createdBy: caller,
        })
        this.json(res, schedule)
        return
      }

      if (method === 'POST' && path.match(/^\/schedules\/[^/]+$/)) {
        const id = this.extractParam(path, 2)
        const body = await this.readBody(req)
        if (body.action === 'cancel') {
          this.service.cancelSchedule(id)
          if (caller) lifecycle.emit({ type: 'cli:schedule', chatId: caller, action: 'cancel' })
          this.json(res, { ok: true })
        }
        return
      }

      if (method === 'POST' && path.match(/^\/schedules\/[^/]+\/run$/)) {
        const id = this.extractParam(path, 2)
        this.service.runSchedule(id)
        if (caller) lifecycle.emit({ type: 'cli:schedule', chatId: caller, action: 'run' })
        this.json(res, { ok: true })
        return
      }

      if (method === 'PATCH' && path.match(/^\/schedules\/[^/]+$/)) {
        const id = this.extractParam(path, 2)
        const body = await this.readBody(req)
        this.service.updateSchedule(id, body as Parameters<ParlourService['updateSchedule']>[1])
        this.json(res, { ok: true })
        return
      }

      if (method === 'POST' && path.match(/^\/schedules\/[^/]+\/toggle$/)) {
        const id = this.extractParam(path, 2)
        const toggled = this.service.toggleSchedule(id)
        this.json(res, { ok: toggled })
        return
      }

      if (method === 'GET' && path.startsWith('/projects/')) {
        const chatId = this.extractParam(path, 2)
        if (caller) lifecycle.emit({ type: 'cli:project', chatId: caller, action: 'list' })
        this.json(res, await this.service.listProjects(chatId))
        return
      }

      if (method === 'POST' && path === '/projects/open') {
        const body = await this.readBody(req)
        const chatId = body.chat_id as string
        if (caller) lifecycle.emit({ type: 'cli:project', chatId: caller, action: 'open' })
        const project = await this.service.openProject(
          chatId, body.path_or_url as string, body.branch as string | undefined, body.base as string | undefined,
        )
        if (!project) { this.json(res, { error: 'Chat not found' }, 404); return }
        this.json(res, project)
        return
      }

      if (method === 'GET' && path === '/events') {
        this.handleSSE(res, url)
        return
      }

      if (method === 'POST' && path === '/hooks') {
        const body = await this.readBody(req)
        const chatId = (body.chat_id as string) ?? caller ?? ''
        this.service.handleHook(chatId, body.event as string, body.data as Record<string, unknown> | undefined)
        this.json(res, { ok: true })
        return
      }

      // ── Git routes ──

      if (method === 'POST' && path === '/git/status') {
        const body = await this.readBody(req)
        this.json(res, await this.service.gitStatus(body.repoPath as string))
        return
      }

      if (method === 'POST' && path === '/git/diff') {
        const body = await this.readBody(req)
        this.json(res, await this.service.gitDiff(body.repoPath as string, body.staged as boolean))
        return
      }

      if (method === 'POST' && path === '/git/file-diff') {
        const body = await this.readBody(req)
        this.json(res, await this.service.gitFileDiff(body.repoPath as string, body.filePath as string))
        return
      }

      if (method === 'POST' && path === '/git/branches') {
        const body = await this.readBody(req)
        this.json(res, await this.service.gitBranches(body.repoPath as string))
        return
      }

      if (method === 'POST' && path === '/git/stage') {
        const body = await this.readBody(req)
        await this.service.gitStage(body.repoPath as string, body.paths as string[])
        this.json(res, { ok: true })
        return
      }

      if (method === 'POST' && path === '/git/unstage') {
        const body = await this.readBody(req)
        await this.service.gitUnstage(body.repoPath as string, body.paths as string[])
        this.json(res, { ok: true })
        return
      }

      if (method === 'POST' && path === '/git/discard') {
        const body = await this.readBody(req)
        await this.service.gitDiscard(body.repoPath as string, body.paths as string[], body.untracked as string[])
        this.json(res, { ok: true })
        return
      }

      if (method === 'POST' && path === '/git/commit') {
        const body = await this.readBody(req)
        await this.service.gitCommit(body.repoPath as string, body.message as string)
        this.json(res, { ok: true })
        return
      }

      if (method === 'POST' && path === '/git/current-branch') {
        const body = await this.readBody(req)
        this.json(res, await this.service.gitCurrentBranch(body.repoPath as string))
        return
      }

      if (method === 'POST' && path === '/git/is-repo') {
        const body = await this.readBody(req)
        this.json(res, await this.service.gitIsRepo(body.dirPath as string))
        return
      }

      if (method === 'POST' && path === '/git/parent-branch') {
        const body = await this.readBody(req)
        this.json(res, await this.service.gitParentBranch(body.repoPath as string, body.branch as string))
        return
      }

      if (method === 'POST' && path === '/git/clone-bare') {
        const body = await this.readBody(req)
        this.json(res, await this.service.gitCloneBare(body.url as string, body.targetDir as string))
        return
      }

      // ── Chat registry routes ──

      if (method === 'GET' && path === '/chats') {
        this.json(res, this.service.getRegistryState())
        return
      }

      if (method === 'POST' && path === '/chats') {
        const body = await this.readBody(req)
        const result = await this.service.createChat(body as Parameters<ParlourService['createChat']>[0])
        this.json(res, result)
        return
      }

      if (method === 'POST' && path.match(/^\/chats\/[^/]+\/child$/)) {
        const parentId = this.extractParam(path, 2)
        const body = await this.readBody(req)
        const result = await this.service.createChildChat(parentId, body as Parameters<ParlourService['createChildChat']>[1])
        this.json(res, result)
        return
      }

      if (method === 'PATCH' && path.match(/^\/chats\/[^/]+$/)) {
        const id = this.extractParam(path, 2)
        const body = await this.readBody(req)
        this.service.updateChat(id, body)
        this.json(res, { ok: true })
        return
      }

      if (method === 'DELETE' && path.match(/^\/chats\/[^/]+$/)) {
        const id = this.extractParam(path, 2)
        await this.service.deleteChat(id)
        this.json(res, { ok: true })
        return
      }

      if (method === 'POST' && path.match(/^\/chats\/[^/]+\/resume$/)) {
        const chatId = this.extractParam(path, 2)
        await this.service.resumeChat(chatId)
        this.json(res, { ok: true })
        return
      }

      if (method === 'POST' && path.match(/^\/chats\/[^/]+\/retitle$/)) {
        const chatId = this.extractParam(path, 2)
        await this.service.retitleChat(chatId)
        this.json(res, { ok: true })
        return
      }

      // ── PTY routes ──

      if (method === 'POST' && path === '/pty') {
        const body = await this.readBody(req)
        const ptyId = await this.service.createPty(
          body.workingDir as string,
          body.shell as string | undefined,
          body.command as string[] | undefined,
          body.extraEnv as Record<string, string> | undefined,
        )
        this.json(res, { ptyId })
        return
      }

      if (method === 'GET' && path === '/pty') {
        this.json(res, this.service.listPtys())
        return
      }

      if (method === 'DELETE' && path.match(/^\/pty\/[^/]+$/)) {
        const ptyId = this.extractParam(path, 2)
        this.service.destroyPty(ptyId)
        this.json(res, { ok: true })
        return
      }

      if (method === 'GET' && path.match(/^\/pty\/[^/]+\/buffer$/)) {
        const ptyId = this.extractParam(path, 2)
        this.json(res, { buffer: this.service.getPtyBuffer(ptyId) ?? '' })
        return
      }

      // ── File routes ──

      if (method === 'POST' && path === '/fs/read') {
        const body = await this.readBody(req)
        this.json(res, await this.service.readFile(body.filePath as string))
        return
      }

      if (method === 'POST' && path === '/fs/write') {
        const body = await this.readBody(req)
        await this.service.writeFile(body.filePath as string, body.content as string)
        this.json(res, { ok: true })
        return
      }

      // ── CLI routes ──

      if (method === 'GET' && path === '/cli/detect') {
        this.json(res, await this.service.detectClis())
        return
      }

      if (method === 'GET' && path === '/cli/defaults') {
        this.json(res, this.service.getCliBaseDefaults())
        return
      }

      // ── GitHub routes ──

      if (method === 'POST' && path === '/github/pr-statuses') {
        const body = await this.readBody(req)
        this.json(res, await this.service.getPrStatuses(body.repoPath as string, body.branches as string[]))
        return
      }

      // ── Shell routes ──

      if (method === 'POST' && path === '/shell/run') {
        const body = await this.readBody(req)
        this.json(res, await this.service.runCommand(body.command as string, body.cwd as string))
        return
      }

      if (method === 'POST' && path === '/shell/open-external') {
        const body = await this.readBody(req)
        await this.service.openExternal(body.url as string)
        this.json(res, { ok: true })
        return
      }

      // ── Chat workspace routes ──

      if (method === 'POST' && path === '/chat-workspace/create-dir') {
        const body = await this.readBody(req)
        const dirPath = await this.service.createChatDir(body.chatId as string, body.parentDirPath as string | undefined)
        this.json(res, { dirPath })
        return
      }

      if (method === 'POST' && path === '/chat-workspace/remove-dir') {
        const body = await this.readBody(req)
        await this.service.removeChatDir(body.chatId as string)
        this.json(res, { ok: true })
        return
      }

      if (method === 'POST' && path === '/chat-workspace/write-agents') {
        const body = await this.readBody(req)
        await this.service.writeAgentsMd(body.chatDir as string)
        this.json(res, { ok: true })
        return
      }

      if (method === 'POST' && path === '/chat-workspace/generate-title') {
        const body = await this.readBody(req)
        const title = await this.service.generateTitle(body.prompt as string, body.llmCommand as string | undefined)
        this.json(res, { title })
        return
      }

      if (method === 'POST' && path === '/chat-workspace/summarize') {
        const body = await this.readBody(req)
        const summary = await this.service.summarizeContext(body.ptyId as string)
        this.json(res, { summary })
        return
      }

      if (method === 'POST' && path === '/chat-workspace/notify-parent') {
        const body = await this.readBody(req)
        this.service.notifyParent(body.parentPtyId as string, body.message as string)
        this.json(res, { ok: true })
        return
      }

      if (method === 'POST' && path === '/chat-workspace/session-id') {
        const body = await this.readBody(req)
        const sessionId = await this.service.getSessionId(body.chatDir as string)
        this.json(res, { sessionId })
        return
      }

      // ── State routes ──

      if (method === 'POST' && path === '/state/save') {
        const body = await this.readBody(req)
        await this.service.saveState(body.data)
        this.json(res, { ok: true })
        return
      }

      if (method === 'GET' && path === '/state/load') {
        this.json(res, await this.service.loadState())
        return
      }

      // ── App routes ──

      if (method === 'GET' && path === '/app/parlour-path') {
        this.json(res, { path: this.service.getParlourPath() })
        return
      }

      if (method === 'GET' && path === '/app/openers') {
        this.json(res, await this.service.discoverOpeners())
        return
      }

      if (method === 'POST' && path === '/app/open-in') {
        const body = await this.readBody(req)
        this.service.openIn(body.openerId as string, body.dirPath as string)
        this.json(res, { ok: true })
        return
      }

      // ── Theme routes ──

      if (method === 'POST' && path === '/theme/mode') {
        const body = await this.readBody(req)
        this.service.setThemeMode(body.mode as 'system' | 'dark' | 'light')
        this.json(res, { ok: true })
        return
      }

      if (method === 'GET' && path === '/theme/resolved') {
        this.json(res, { resolved: this.service.getThemeResolved() })
        return
      }

      this.json(res, { error: 'Not found' }, 404)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('API error', { path, error: msg })
      this.json(res, { error: msg }, 500)
    }
  }

  private handleSSE(res: ServerResponse, url: URL): void {
    const typesParam = url.searchParams.get('types') ?? '*'
    const filters = typesParam.split(',').map((t) => t.trim())

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    const matches = (eventType: string): boolean => {
      for (const f of filters) {
        if (f === '*') return true
        if (f.endsWith(':*') && eventType.startsWith(f.slice(0, -1))) return true
        if (f === eventType) return true
      }
      return false
    }

    let eventId = 0
    const unsub = lifecycle.on('*', (event) => {
      if (!matches(event.type)) return
      eventId++
      res.write(`id: ${eventId}\ndata: ${JSON.stringify(event)}\n\n`)
    })

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n')
    }, 30_000)

    res.on('close', () => {
      unsub()
      clearInterval(heartbeat)
    })
  }

  // ── WebSocket upgrade routing ──

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

    if (url.pathname === '/ws') {
      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.handleMultiplexConnection(ws)
      })
      return
    }

    const ptyMatch = url.pathname.match(/^\/api\/pty\/([^/]+)\/stream$/)
    if (ptyMatch) {
      this.handlePtyUpgrade(req, socket, head, ptyMatch[1])
      return
    }

    socket.destroy()
  }

  private handlePtyUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, chatId: string): void {
    const ptyId = this.service.getPtyIdForChat(chatId)
    if (!ptyId) {
      socket.destroy()
      return
    }

    this.wss!.handleUpgrade(req, socket, head, (ws) => {
      log.info('PTY WebSocket connected', { chatId, ptyId })

      const unsubOutput = this.service.onPtyOutput(ptyId, (_id, data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data)
      })

      ws.on('message', (msg) => {
        const raw = msg.toString()
        try {
          const parsed = JSON.parse(raw)
          if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
            this.service.resizePty(ptyId, parsed.cols, parsed.rows)
            return
          }
        } catch {}
        this.service.writePty(ptyId, raw)
      })

      ws.on('close', () => {
        unsubOutput()
        log.info('PTY WebSocket disconnected', { chatId, ptyId })
      })
    })
  }

  // ── Multiplexed WebSocket ──

  private handleMultiplexConnection(ws: WebSocket): void {
    const client: WsClient = { ws, ptyUnsubs: new Map(), stateUnsub: null, eventsUnsub: null }
    this.wsClients.add(client)
    log.info('Multiplex WebSocket connected')

    this.send(ws, { type: 'hello', version: '1' })

    ws.on('message', (raw) => {
      let msg: ClientMessage
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      this.handleClientMessage(client, msg)
    })

    ws.on('close', () => {
      log.info('Multiplex WebSocket disconnected')
      this.cleanupClient(client)
      this.wsClients.delete(client)
    })
  }

  private handleClientMessage(client: WsClient, msg: ClientMessage): void {
    switch (msg.type) {
      case 'pty:subscribe':
        this.handlePtySubscribe(client, msg.ptyId)
        break
      case 'pty:unsubscribe':
        this.handlePtyUnsubscribe(client, msg.ptyId)
        break
      case 'pty:write':
        this.service.writePty(msg.ptyId, msg.data)
        break
      case 'pty:resize':
        this.service.resizePty(msg.ptyId, msg.cols, msg.rows)
        break
      case 'state:subscribe':
        this.handleStateSubscribe(client)
        break
      case 'events:subscribe':
        this.handleEventsSubscribe(client, msg.filters)
        break
      case 'theme:resolved':
        this.service.setThemeResolved(msg.resolved)
        break
    }
  }

  private handlePtySubscribe(client: WsClient, ptyId: string): void {
    if (client.ptyUnsubs.has(ptyId)) return

    const unsubs: Array<() => void> = []

    const buffer = this.service.getPtyBuffer(ptyId)
    if (buffer) this.send(client.ws, { type: 'pty:buffer', ptyId, data: buffer })

    unsubs.push(this.service.onPtyOutput(ptyId, (_id, data) => {
      this.send(client.ws, { type: 'pty:data', ptyId, data })
    }))

    unsubs.push(this.service.onPtyTitle(ptyId, (_id, title) => {
      this.send(client.ws, { type: 'pty:title', ptyId, title })
    }))

    unsubs.push(this.service.onPtyExit(ptyId, (exitCode) => {
      this.send(client.ws, { type: 'pty:exit', ptyId, exitCode })
      client.ptyUnsubs.delete(ptyId)
    }))

    unsubs.push(this.service.onPtyFirstInput(ptyId, (_id, input) => {
      this.send(client.ws, { type: 'pty:firstInput', ptyId, input })
    }))

    client.ptyUnsubs.set(ptyId, () => { for (const u of unsubs) u() })
  }

  private handlePtyUnsubscribe(client: WsClient, ptyId: string): void {
    const unsub = client.ptyUnsubs.get(ptyId)
    if (unsub) {
      unsub()
      client.ptyUnsubs.delete(ptyId)
    }
  }

  private handleStateSubscribe(client: WsClient): void {
    if (client.stateUnsub) return

    this.send(client.ws, { type: 'state:chats', chats: this.chatRegistry.getState().chats })
    this.send(client.ws, { type: 'state:schedules', schedules: this.taskScheduler.list() })

    const chatUnsub = this.chatRegistry.addStateListener((state) => {
      this.send(client.ws, { type: 'state:chats', chats: state.chats })
    })
    const scheduleUnsub = this.taskScheduler.addScheduleListener((schedules) => {
      this.send(client.ws, { type: 'state:schedules', schedules })
    })

    client.stateUnsub = () => { chatUnsub(); scheduleUnsub() }
  }

  private handleEventsSubscribe(client: WsClient, filters?: string[]): void {
    if (client.eventsUnsub) return

    const filterList = filters && filters.length > 0 ? filters : ['*']

    const matches = (eventType: string): boolean => {
      for (const f of filterList) {
        if (f === '*') return true
        if (f.endsWith(':*') && eventType.startsWith(f.slice(0, -1))) return true
        if (f === eventType) return true
      }
      return false
    }

    client.eventsUnsub = lifecycle.on('*', (event) => {
      if (!matches(event.type)) return
      this.send(client.ws, { type: 'event', event })
    })
  }

  private cleanupClient(client: WsClient): void {
    for (const unsub of client.ptyUnsubs.values()) unsub()
    client.ptyUnsubs.clear()
    client.stateUnsub?.()
    client.stateUnsub = null
    client.eventsUnsub?.()
    client.eventsUnsub = null
  }

  // ── Server lifecycle ──

  async start(requestedPort = 0): Promise<number> {
    await mkdir(PARLOUR_DIR, { recursive: true })

    this.wss = new WebSocketServer({ noServer: true })

    this.themeUnsub = this.service.onThemeChange((resolved) => {
      this.broadcast({ type: 'theme:resolved', resolved })
    })

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

    this.httpServer.on('upgrade', (req, socket, head) => {
      this.handleUpgrade(req, socket, head)
    })

    return new Promise((resolve, reject) => {
      this.httpServer!.listen(requestedPort, '127.0.0.1', async () => {
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
    this.themeUnsub?.()
    this.wss?.close()
    if (this.httpServer) {
      return new Promise((resolve) => {
        this.httpServer!.close(() => resolve())
      })
    }
  }
}
