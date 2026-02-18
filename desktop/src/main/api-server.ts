import { createServer, type Server as HttpServer } from 'node:http'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { WebSocketServer, WebSocket } from 'ws'
import { PARLOUR_DIR } from './parlour-dirs'
import { logger as rootLogger } from './logger'
import { lifecycle } from './lifecycle'
import { ParlourService } from './parlour-service'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'

const log = rootLogger.child({ service: 'ApiServer' })
const PORT_FILE = join(PARLOUR_DIR, '.mcp-port')

export class ApiServer {
  private httpServer: HttpServer | null = null
  private wss: WebSocketServer | null = null
  private port = 0

  constructor(private service: ParlourService) {}

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
        const parentId = (body.parent_chat_id as string) ?? caller
        lifecycle.emit({ type: 'cli:dispatch', chatId: parentId ?? '', parentId, prompt: body.prompt as string })
        const result = await this.service.dispatch(body.prompt as string, {
          parentId, llm: body.llm as string | undefined,
          project: body.project as string | undefined, branch: body.branch as string | undefined,
        })
        this.json(res, result)
        return
      }

      if (req.method === 'GET' && path.startsWith('/status/')) {
        const chatId = path.split('/')[2]
        if (caller) lifecycle.emit({ type: 'cli:status', chatId: caller, queriedId: chatId })
        const status = this.service.getStatus(chatId)
        if (!status) { this.json(res, { error: 'Chat not found' }, 404); return }
        this.json(res, status)
        return
      }

      if (req.method === 'GET' && path.startsWith('/children/')) {
        const parentId = path.split('/')[2]
        this.json(res, this.service.getChildren(parentId))
        return
      }

      if (req.method === 'POST' && path === '/report') {
        const body = await this.readBody(req)
        const chatId = body.chat_id as string
        const parentId = body.parent_id as string
        const ok = this.service.report(chatId, parentId, body.message as string)
        if (!ok) { this.json(res, { error: 'Parent not running' }, 400); return }
        lifecycle.emit({ type: 'cli:report', chatId, parentId })
        this.json(res, { ok: true })
        return
      }

      if (req.method === 'GET' && path === '/schedules') {
        if (caller) lifecycle.emit({ type: 'cli:schedule', chatId: caller, action: 'list' })
        this.json(res, this.service.listSchedules())
        return
      }

      if (req.method === 'POST' && path === '/schedules') {
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

      if (req.method === 'POST' && path.match(/^\/schedules\/[^/]+$/)) {
        const id = path.split('/')[2]
        const body = await this.readBody(req)
        if (body.action === 'cancel') {
          this.service.cancelSchedule(id)
          if (caller) lifecycle.emit({ type: 'cli:schedule', chatId: caller, action: 'cancel' })
          this.json(res, { ok: true })
        }
        return
      }

      if (req.method === 'POST' && path.match(/^\/schedules\/[^/]+\/run$/)) {
        const id = path.split('/')[2]
        this.service.runSchedule(id)
        if (caller) lifecycle.emit({ type: 'cli:schedule', chatId: caller, action: 'run' })
        this.json(res, { ok: true })
        return
      }

      if (req.method === 'GET' && path.startsWith('/projects/')) {
        const chatId = path.split('/')[2]
        if (caller) lifecycle.emit({ type: 'cli:project', chatId: caller, action: 'list' })
        this.json(res, await this.service.listProjects(chatId))
        return
      }

      if (req.method === 'POST' && path === '/projects/open') {
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

      if (req.method === 'GET' && path === '/events') {
        this.handleSSE(res, url)
        return
      }

      if (req.method === 'POST' && path === '/hooks') {
        const body = await this.readBody(req)
        const chatId = (body.chat_id as string) ?? caller ?? ''
        this.service.handleHook(chatId, body.event as string, body.data as Record<string, unknown> | undefined)
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

  private handlePtyUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const match = url.pathname.match(/^\/api\/pty\/([^/]+)\/stream$/)
    if (!match) {
      socket.destroy()
      return
    }

    const chatId = match[1]
    const ptyId = this.service.getPtyIdForChat(chatId)
    if (!ptyId) {
      socket.destroy()
      return
    }

    this.wss!.handleUpgrade(req, socket, head, (ws) => {
      log.info('PTY WebSocket connected', { chatId, ptyId })

      this.service.onPtyOutput(ptyId, (_id, data) => {
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
        log.info('PTY WebSocket disconnected', { chatId, ptyId })
      })
    })
  }

  async start(): Promise<number> {
    await mkdir(PARLOUR_DIR, { recursive: true })

    this.wss = new WebSocketServer({ noServer: true })

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
      this.handlePtyUpgrade(req, socket, head)
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
    this.wss?.close()
    if (this.httpServer) {
      return new Promise((resolve) => {
        this.httpServer!.close(() => resolve())
      })
    }
  }
}
