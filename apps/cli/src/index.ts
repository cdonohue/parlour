#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const CHORALE_DIR = join(homedir(), '.chorale')
const DEBUG = process.env.CHORALE_DEBUG === '1'

function debug(msg: string): void {
  if (DEBUG) process.stderr.write(`[chorale] ${msg}\n`)
}

function resolveBaseUrl(): string {
  if (process.env.CHORALE_API_URL) return process.env.CHORALE_API_URL
  try {
    const port = readFileSync(join(CHORALE_DIR, '.mcp-port'), 'utf-8').trim()
    return `http://localhost:${port}`
  } catch {
    process.stderr.write('Error: Chorale not running (no .mcp-port file)\n')
    process.exit(1)
  }
}

const BASE_URL = resolveBaseUrl()
const CHAT_ID = process.env.CHORALE_CHAT_ID ?? ''
const PARENT_ID = process.env.CHORALE_PARENT_CHAT_ID

async function api(path: string, body?: Record<string, unknown>): Promise<unknown> {
  const url = `${BASE_URL}/api${path}?caller=${CHAT_ID}`
  debug(`${body ? 'POST' : 'GET'} ${url}`)

  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    process.stderr.write(`Error ${res.status}: ${text}\n`)
    process.exit(1)
  }

  return res.json()
}

function usage(): void {
  process.stdout.write(`Usage: chorale <command> [args]

Commands:
  dispatch <prompt> [flags]      Spawn a chat
    --llm <command>                Override LLM (e.g. codex, gemini, opencode, aider)
    --project <path-or-url>        Attach project
    --branch <name>                Project branch
  status [chatId] [--follow]     Check chat status (--follow for live SSE stream)
  list-children                  List child chats
  read-screen [chatId] [--lines N]  Read full PTY output
  report <message>               Send message to parent
  send <chatId> <message>        Send message to any chat
  schedule <prompt> --cron <exp> Create scheduled task
  schedule list                  List schedules
  schedule cancel <id>           Cancel schedule
  schedule run <id>              Run schedule now
  project list                   List chat's projects
  project open <path-or-url>     Clone/checkout project
  hook <event> [--tool <name>]   Emit harness lifecycle event

Environment:
  CHORALE_CHAT_ID      Set automatically per chat
  CHORALE_API_URL      Override API base URL (for cloud)
  CHORALE_DEBUG=1      Debug logging to stderr
`)
}

async function dispatch(args: string[]): Promise<void> {
  const prompt = args.join(' ')
  if (!prompt) {
    process.stderr.write('Usage: chorale dispatch <prompt>\n')
    process.exit(1)
  }

  const projectFlag = extractFlag(args, '--project')
  const branchFlag = extractFlag(args, '--branch')
  const llmFlag = extractFlag(args, '--llm')
  const promptClean = args.join(' ')

  const result = await api('/dispatch', {
    prompt: promptClean || prompt,
    parent_chat_id: CHAT_ID || undefined,
    project: projectFlag,
    branch: branchFlag,
    llm: llmFlag,
  })

  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

async function status(args: string[]): Promise<void> {
  const follow = args.includes('--follow')
  const filtered = args.filter((a) => a !== '--follow')
  const chatId = filtered[0] || CHAT_ID

  const result = await api(`/status/${chatId}`)
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')

  if (follow) {
    const types = `harness:*,chat:*`
    const url = `${BASE_URL}/api/events?types=${types}&caller=${CHAT_ID}`
    debug(`SSE connecting: ${url}`)
    const res = await fetch(url, { headers: { Accept: 'text/event-stream' } })
    if (!res.ok || !res.body) {
      process.stderr.write(`Error: SSE connection failed (${res.status})\n`)
      process.exit(1)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()!
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          process.stdout.write(line.slice(6) + '\n')
        }
      }
    }
  }
}

async function readScreen(args: string[]): Promise<void> {
  const linesFlag = extractFlag(args, '--lines')
  const chatId = args[0] || CHAT_ID
  if (!chatId) {
    process.stderr.write('Usage: chorale read-screen [chatId] [--lines N]\n')
    process.exit(1)
  }
  const qs = new URLSearchParams({ caller: CHAT_ID })
  if (linesFlag) qs.set('lines', linesFlag)
  const url = `${BASE_URL}/api/read-screen/${chatId}?${qs}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    process.stderr.write(`Error ${res.status}: ${text}\n`)
    process.exit(1)
  }
  const result = await res.json() as { buffer: string }
  process.stdout.write(result.buffer)
}

async function listChildren(): Promise<void> {
  const result = await api(`/children/${CHAT_ID}`)
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

async function report(args: string[]): Promise<void> {
  const message = args.join(' ')
  if (!message || !PARENT_ID) {
    if (!PARENT_ID) process.stderr.write('Error: not a child chat (no CHORALE_PARENT_CHAT_ID)\n')
    else process.stderr.write('Usage: chorale report <message>\n')
    process.exit(1)
  }

  await api('/report', { chat_id: CHAT_ID, parent_id: PARENT_ID, message })
  process.stdout.write('Reported to parent\n')
}

async function send(args: string[]): Promise<void> {
  const targetId = args[0]
  const message = args.slice(1).join(' ')
  if (!targetId || !message) {
    process.stderr.write('Usage: chorale send <chatId> <message>\n')
    process.exit(1)
  }

  await api('/send', { chat_id: CHAT_ID || undefined, target_id: targetId, message })
  process.stdout.write(`Sent to ${targetId}\n`)
}

async function schedule(args: string[]): Promise<void> {
  const sub = args[0]

  if (sub === 'list') {
    const result = await api('/schedules')
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    return
  }

  if (sub === 'cancel') {
    if (!args[1]) { process.stderr.write('Usage: chorale schedule cancel <id>\n'); process.exit(1) }
    await api(`/schedules/${args[1]}`, { action: 'cancel' })
    process.stdout.write(`Cancelled ${args[1]}\n`)
    return
  }

  if (sub === 'run') {
    if (!args[1]) { process.stderr.write('Usage: chorale schedule run <id>\n'); process.exit(1) }
    await api(`/schedules/${args[1]}/run`, {})
    process.stdout.write(`Triggered ${args[1]}\n`)
    return
  }

  const cronIdx = args.indexOf('--cron')
  const atIdx = args.indexOf('--at')
  const prompt = args.filter((_a, i) => {
    if (i === cronIdx || i === cronIdx + 1) return false
    if (i === atIdx || i === atIdx + 1) return false
    return true
  }).join(' ')

  const cron = cronIdx >= 0 ? args[cronIdx + 1] : undefined
  const at = atIdx >= 0 ? args[atIdx + 1] : undefined

  if (!prompt || (!cron && !at)) {
    process.stderr.write('Usage: chorale schedule <prompt> --cron <expr> | --at <datetime>\n')
    process.exit(1)
  }

  const result = await api('/schedules', { prompt, cron, at })
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

async function project(args: string[]): Promise<void> {
  const sub = args[0]

  if (sub === 'list') {
    const result = await api(`/projects/${CHAT_ID}`)
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    return
  }

  if (sub === 'open') {
    const pathOrUrl = args[1]
    const branch = extractFlag(args.slice(2), '--branch')
    const base = extractFlag(args.slice(2), '--base')
    if (!pathOrUrl) { process.stderr.write('Usage: chorale project open <path-or-url>\n'); process.exit(1) }
    const result = await api('/projects/open', { chat_id: CHAT_ID, path_or_url: pathOrUrl, branch, base })
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    return
  }

  process.stderr.write('Usage: chorale project [list|open]\n')
  process.exit(1)
}

async function hook(args: string[]): Promise<void> {
  const event = args[0]
  if (!event) { process.stderr.write('Usage: chorale hook <event> [--tool <name>]\n'); process.exit(1) }

  const tool = extractFlag(args.slice(1), '--tool')
  const data: Record<string, unknown> = {}
  if (tool) data.tool = tool

  if (!process.stdin.isTTY) {
    try {
      const chunks: Buffer[] = []
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
      const stdin = Buffer.concat(chunks).toString('utf-8').trim()
      if (stdin) {
        try { Object.assign(data, JSON.parse(stdin)) } catch { data.stdin = stdin }
      }
    } catch {}
  }

  await api('/hooks', { chat_id: CHAT_ID, event, data })
  debug(`Hook emitted: ${event}`)
}

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx < 0 || idx + 1 >= args.length) return undefined
  const val = args[idx + 1]
  args.splice(idx, 2)
  return val
}

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'dispatch': await dispatch(args); break
  case 'status': await status(args); break
  case 'read-screen': await readScreen(args); break
  case 'list-children': await listChildren(); break
  case 'report': await report(args); break
  case 'send': await send(args); break
  case 'schedule': await schedule(args); break
  case 'project': await project(args); break
  case 'hook': await hook(args); break
  case '--help': case '-h': case undefined: usage(); break
  default:
    process.stderr.write(`Unknown command: ${command}\nRun 'chorale --help' for usage.\n`)
    process.exit(1)
}
