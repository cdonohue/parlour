import { createServer, type Server as HttpServer } from 'node:http'
import { join, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { mkdir, writeFile, cp } from 'node:fs/promises'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { PtyManager } from './pty-manager'
import { TaskScheduler } from './task-scheduler'
import { ChatRegistry } from './chat-registry'
import { PARLOUR_DIR, PROJECT_SETUP_DIR, scanProjects, writeAgentsMd } from './parlour-dirs'

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

const MCP_PORT_FILE = join(PARLOUR_DIR, '.mcp-port')
const MCP_CONFIG_FILE = join(PARLOUR_DIR, '.mcp.json')

export class ParlourMcpServer {
  private httpServer: HttpServer | null = null
  private ptyManager: PtyManager
  private chatRegistry: ChatRegistry
  private taskScheduler: TaskScheduler
  private sessions = new Map<string, string>()
  private port = 0
  private settingsGetter: () => { llmCommand: string; projectRoots: string[] }

  constructor(ptyManager: PtyManager, settingsGetter: () => { llmCommand: string; projectRoots: string[] }, taskScheduler: TaskScheduler, chatRegistry: ChatRegistry) {
    this.ptyManager = ptyManager
    this.settingsGetter = settingsGetter
    this.taskScheduler = taskScheduler
    this.chatRegistry = chatRegistry
  }

  private createMcpServer(callerChatId?: string): McpServer {
    const server = new McpServer({ name: 'parlour', version: '1.0.0' })
    this.registerTools(server, callerChatId)
    return server
  }

  private registerTools(server: McpServer, callerChatId?: string): void {
    // ── open_dir ──
    server.registerTool(
      'open_dir',
      {
        title: 'Open Directory',
        description: 'Open a project by local path or git URL. Creates a local clone under this chat\'s projects/. Optionally specify branch and base branch.',
        inputSchema: z.object({
          path_or_url: z.string().describe('Local path or git URL'),
          branch: z.string().optional().describe('Branch to check out'),
          base: z.string().optional().describe('Base branch for creating a new branch (requires branch)'),
        }),
      },
      async ({ path_or_url, branch, base }) => {
        if (!callerChatId) {
          return { content: [{ type: 'text' as const, text: 'No caller context' }], isError: true }
        }
        const chat = this.chatRegistry.getChat(callerChatId)
        if (!chat?.dirPath) {
          return { content: [{ type: 'text' as const, text: 'Chat not found' }], isError: true }
        }

        try {
          const project = await this.chatRegistry.cloneProject(chat.dirPath, path_or_url, branch, base)
          await this.chatRegistry.scanChatProjects(callerChatId)
          const projects = await scanProjects(chat.dirPath)
          await writeAgentsMd(chat.dirPath, projects, this.settingsGetter().projectRoots)

          return { content: [{ type: 'text' as const, text: JSON.stringify({ name: project.name, path: project.path, branch: project.branch }) }] }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { content: [{ type: 'text' as const, text: msg }], isError: true }
        }
      },
    )

    // ── list_projects ──
    server.registerTool(
      'list_projects',
      {
        title: 'List Projects',
        description: 'List projects available to this chat with their branches.',
      },
      async () => {
        if (!callerChatId) {
          return { content: [{ type: 'text' as const, text: '[]' }] }
        }
        const chat = this.chatRegistry.getChat(callerChatId)
        if (!chat?.dirPath) {
          return { content: [{ type: 'text' as const, text: '[]' }] }
        }

        const projects = await scanProjects(chat.dirPath)
        return { content: [{ type: 'text' as const, text: JSON.stringify(projects.map((p) => ({ name: p.name, path: p.path, branch: p.branch }))) }] }
      },
    )

    // ── save_project_setup ──
    server.registerTool(
      'save_project_setup',
      {
        title: 'Save Project Setup',
        description: 'Save files from the current clone for automatic setup in future clones of this project.',
        inputSchema: z.object({
          project: z.string().describe('Project name'),
          files: z.array(z.string()).describe('Relative file paths to save (e.g. [".env", "config/user.json"])'),
        }),
      },
      async ({ project, files }) => {
        if (!callerChatId) {
          return { content: [{ type: 'text' as const, text: 'No caller context' }], isError: true }
        }
        const chat = this.chatRegistry.getChat(callerChatId)
        if (!chat?.dirPath) {
          return { content: [{ type: 'text' as const, text: 'Chat not found' }], isError: true }
        }

        const projectDir = join(chat.dirPath, 'projects', project)
        if (!existsSync(projectDir)) {
          return { content: [{ type: 'text' as const, text: `Project not found: ${project}` }], isError: true }
        }

        const setupDir = join(PROJECT_SETUP_DIR, project, 'files')
        await mkdir(setupDir, { recursive: true })

        const saved: string[] = []
        for (const file of files) {
          const src = join(projectDir, file)
          const dest = join(setupDir, file)
          if (!existsSync(src)) continue
          await mkdir(join(dest, '..'), { recursive: true })
          await cp(src, dest, { force: true })
          saved.push(file)
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify({ project, saved }) }] }
      },
    )

    // ── dispatch ──
    server.registerTool(
      'dispatch',
      {
        title: 'Dispatch Sub-Agent',
        description: 'Spawn a sub-agent chat with a prompt. Optionally target a project to get a clone.',
        inputSchema: z.object({
          prompt: z.string().describe('Task description for the sub-agent'),
          project: z.string().optional().describe('Project path or URL — creates a clone if provided'),
          branch: z.string().optional().describe('Branch for the project clone'),
          llm: z.string().optional().describe('Override LLM command'),
          parent_chat_id: z.string().optional().describe('Parent chat ID'),
        }),
      },
      async ({ prompt, project, branch, llm, parent_chat_id: explicitParent }) => {
        const parent_chat_id = explicitParent ?? callerChatId
        const sessionId = crypto.randomUUID().slice(0, 8)
        const llmCommand = llm ?? this.settingsGetter().llmCommand

        const opts = {
          name: deriveShortTitle(prompt),
          llmCommand,
          prompt,
          background: true,
          project: project ? { pathOrUrl: project, branch } : undefined,
        }

        const result = parent_chat_id
          ? await this.chatRegistry.createChildChat(parent_chat_id, opts)
          : await this.chatRegistry.createChat(opts)

        this.sessions.set(sessionId, result.chat.id)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ sessionId, chatId: result.chat.id, chatDir: result.chat.dirPath }),
          }],
        }
      },
    )

    // ── get_status ──
    server.registerTool(
      'get_status',
      {
        title: 'Get Dispatch Status',
        description: 'Check the status of a dispatched sub-agent session.',
        inputSchema: z.object({
          session_id: z.string().describe('Session ID from dispatch'),
        }),
      },
      async ({ session_id }) => {
        const chatId = this.sessions.get(session_id)
        if (!chatId) {
          return { content: [{ type: 'text' as const, text: `Unknown session: ${session_id}` }], isError: true }
        }

        const chat = this.chatRegistry.getChat(chatId)
        if (!chat) {
          return { content: [{ type: 'text' as const, text: `Chat not found: ${chatId}` }], isError: true }
        }

        const buffer = chat.ptyId ? this.ptyManager.getBuffer(chat.ptyId) : ''
        const tail = buffer.length > 4000 ? buffer.slice(-4000) : buffer

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ status: chat.status, output: tail }),
          }],
        }
      },
    )

    // ── schedule_chat ──
    server.registerTool(
      'schedule_chat',
      {
        title: 'Schedule Chat',
        description: 'Schedule a recurring or one-time chat.',
        inputSchema: z.object({
          prompt: z.string().describe('Prompt for the chat'),
          name: z.string().optional().describe('Display name'),
          cron: z.string().optional().describe('Cron expression for recurring'),
          at: z.string().optional().describe('ISO datetime for one-time'),
          project: z.string().optional().describe('Project path or URL'),
          llm: z.string().optional().describe('Override LLM command'),
        }),
      },
      async ({ prompt, name, cron: cronExpr, at, project, llm }) => {
        if ((!cronExpr && !at) || (cronExpr && at)) {
          return { content: [{ type: 'text' as const, text: 'Provide exactly one of cron or at' }], isError: true }
        }
        const trigger = cronExpr ? { type: 'cron' as const, cron: cronExpr } : { type: 'once' as const, at: at! }

        const schedule = this.taskScheduler.create({
          name: name ?? deriveShortTitle(prompt),
          prompt,
          trigger,
          project,
          llmCommand: llm,
          createdBy: callerChatId,
        })
        return { content: [{ type: 'text' as const, text: JSON.stringify({ id: schedule.id, name: schedule.name, trigger: schedule.trigger }) }] }
      },
    )

    // ── list_schedules ──
    server.registerTool(
      'list_schedules',
      {
        title: 'List Schedules',
        description: 'List all scheduled chats.',
      },
      async () => {
        const schedules = this.taskScheduler.list().map((s) => ({
          id: s.id, name: s.name, prompt: s.prompt, trigger: s.trigger,
          enabled: s.enabled, lastRunAt: s.lastRunAt, lastRunStatus: s.lastRunStatus,
        }))
        return { content: [{ type: 'text' as const, text: JSON.stringify(schedules) }] }
      },
    )

    // ── cancel_schedule ──
    server.registerTool(
      'cancel_schedule',
      {
        title: 'Cancel Schedule',
        description: 'Delete a scheduled chat by ID.',
        inputSchema: z.object({
          id: z.string().describe('Schedule ID to cancel'),
        }),
      },
      async ({ id }) => {
        this.taskScheduler.delete(id)
        return { content: [{ type: 'text' as const, text: `Deleted schedule ${id}` }] }
      },
    )

    // ── run_schedule ──
    server.registerTool(
      'run_schedule',
      {
        title: 'Run Schedule Now',
        description: 'Trigger an immediate one-off run of a scheduled automation.',
        inputSchema: z.object({
          id: z.string().describe('Schedule ID to run'),
        }),
      },
      async ({ id }) => {
        const schedule = this.taskScheduler.list().find((s) => s.id === id)
        if (!schedule) {
          return { content: [{ type: 'text' as const, text: `Unknown schedule: ${id}` }], isError: true }
        }
        if (!schedule.prompt.trim()) {
          return { content: [{ type: 'text' as const, text: 'Schedule has no prompt' }], isError: true }
        }
        this.taskScheduler.runNow(id)
        return { content: [{ type: 'text' as const, text: `Triggered run of "${schedule.name}"` }] }
      },
    )

    // ── list_children ──
    server.registerTool(
      'list_children',
      {
        title: 'List Child Chats',
        description: 'List child chats (subtasks) of a given chat.',
        inputSchema: z.object({
          chat_id: z.string().describe('Parent chat ID'),
        }),
      },
      async ({ chat_id }) => {
        const children = this.chatRegistry.getChildren(chat_id).map((c) => ({
          id: c.id,
          status: c.status,
        }))
        return { content: [{ type: 'text' as const, text: JSON.stringify(children) }] }
      },
    )

    // ── report_to_parent ──
    server.registerTool(
      'report_to_parent',
      {
        title: 'Report to Parent',
        description: 'Send a message to the parent chat PTY.',
        inputSchema: z.object({
          chat_id: z.string().describe('Child chat ID'),
          message: z.string().describe('Message to inject into parent PTY'),
        }),
      },
      async ({ chat_id, message }) => {
        const chat = this.chatRegistry.getChat(chat_id)
        if (!chat?.parentId) {
          return { content: [{ type: 'text' as const, text: 'Chat has no parent' }], isError: true }
        }
        const parent = this.chatRegistry.getChat(chat.parentId)
        if (!parent?.ptyId) {
          return { content: [{ type: 'text' as const, text: 'Parent not running' }], isError: true }
        }
        this.ptyManager.write(parent.ptyId, `\r\n${message}\r\n`)
        return { content: [{ type: 'text' as const, text: 'Message sent to parent' }] }
      },
    )

    // ── get_parent_output ──
    server.registerTool(
      'get_parent_output',
      {
        title: 'Get Parent Output',
        description: 'Read the parent chat\'s terminal output. Only works from a child chat.',
        inputSchema: z.object({}),
      },
      async () => {
        if (!callerChatId) {
          return { content: [{ type: 'text' as const, text: 'No caller context' }], isError: true }
        }
        const chat = this.chatRegistry.getChat(callerChatId)
        if (!chat?.parentId) {
          return { content: [{ type: 'text' as const, text: 'No parent chat' }], isError: true }
        }
        const parent = this.chatRegistry.getChat(chat.parentId)
        if (!parent?.ptyId) {
          return { content: [{ type: 'text' as const, text: 'Parent not running' }], isError: true }
        }
        const buffer = this.ptyManager.getBuffer(parent.ptyId)
        const tail = buffer.length > 8000 ? buffer.slice(-8000) : buffer
        return { content: [{ type: 'text' as const, text: tail }] }
      },
    )
  }

  async start(): Promise<number> {
    await mkdir(PARLOUR_DIR, { recursive: true })

    this.httpServer = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      if (req.method === 'POST' && url.pathname === '/mcp') {
        const callerChatId = url.searchParams.get('caller') ?? undefined
        const server = this.createMcpServer(callerChatId)
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
        await server.connect(transport)
        await transport.handleRequest(req, res)
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

        await writeFile(MCP_PORT_FILE, String(this.port), 'utf-8')
        await writeFile(MCP_CONFIG_FILE, JSON.stringify({
          mcpServers: {
            parlour: {
              type: 'http',
              url: `http://localhost:${this.port}/mcp`,
            },
          },
        }, null, 2), 'utf-8')

        console.log(`Parlour MCP server listening on port ${this.port}`)
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
