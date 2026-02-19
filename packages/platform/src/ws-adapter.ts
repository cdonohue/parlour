import type { ClientMessage, ServerMessage } from '@parlour/api-types'
import type { PlatformAdapter } from './adapter'

type Unsubscribe = () => void
type Listener<T> = (value: T) => void

const RECONNECT_BASE_MS = 500
const RECONNECT_MAX_MS = 30_000

export function createWebSocketAdapter(
  serverUrl: string,
  overrides?: Partial<PlatformAdapter>,
): PlatformAdapter {
  const apiBase = `${serverUrl}/api`

  const ptyDataListeners = new Map<string, Set<Listener<string>>>()
  const ptyTitleListeners = new Map<string, Set<Listener<string>>>()
  const ptyFirstInputListeners = new Map<string, Set<Listener<string>>>()
  const ptyExitListeners = new Map<string, Set<Listener<number>>>()
  const stateListeners = new Set<Listener<{ chats: unknown[] }>>()
  const scheduleListeners = new Set<Listener<unknown[]>>()
  const themeListeners = new Set<Listener<'dark' | 'light'>>()

  let ws: WebSocket | null = null
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let stateSubscribed = false

  function hasPtyListeners(ptyId: string): boolean {
    return (
      (ptyDataListeners.get(ptyId)?.size ?? 0) > 0 ||
      (ptyTitleListeners.get(ptyId)?.size ?? 0) > 0 ||
      (ptyFirstInputListeners.get(ptyId)?.size ?? 0) > 0 ||
      (ptyExitListeners.get(ptyId)?.size ?? 0) > 0
    )
  }

  function activePtyIds(): string[] {
    const ids = new Set<string>()
    for (const id of ptyDataListeners.keys()) if (ptyDataListeners.get(id)!.size > 0) ids.add(id)
    for (const id of ptyTitleListeners.keys()) if (ptyTitleListeners.get(id)!.size > 0) ids.add(id)
    for (const id of ptyFirstInputListeners.keys())
      if (ptyFirstInputListeners.get(id)!.size > 0) ids.add(id)
    for (const id of ptyExitListeners.keys()) if (ptyExitListeners.get(id)!.size > 0) ids.add(id)
    return [...ids]
  }

  function send(msg: ClientMessage): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  function connect(): void {
    const wsUrl = serverUrl.replace(/^http/, 'ws') + '/ws'
    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      reconnectAttempt = 0
      if (stateSubscribed) send({ type: 'state:subscribe' })
      for (const ptyId of activePtyIds()) {
        send({ type: 'pty:subscribe', ptyId })
      }
    }

    ws.onmessage = (ev) => {
      const msg: ServerMessage = JSON.parse(ev.data as string)
      switch (msg.type) {
        case 'pty:data':
        case 'pty:buffer':
          ptyDataListeners.get(msg.ptyId)?.forEach((cb) => cb(msg.data))
          break
        case 'pty:title':
          ptyTitleListeners.get(msg.ptyId)?.forEach((cb) => cb(msg.title))
          break
        case 'pty:exit':
          ptyExitListeners.get(msg.ptyId)?.forEach((cb) => cb(msg.exitCode))
          break
        case 'pty:firstInput':
          ptyFirstInputListeners.get(msg.ptyId)?.forEach((cb) => cb(msg.input))
          break
        case 'state:chats':
          stateListeners.forEach((cb) => cb({ chats: msg.chats }))
          break
        case 'state:schedules':
          scheduleListeners.forEach((cb) => cb(msg.schedules))
          break
        case 'theme:resolved':
          themeListeners.forEach((cb) => cb(msg.resolved))
          break
      }
    }

    ws.onclose = () => {
      scheduleReconnect()
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  function scheduleReconnect(): void {
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS)
    reconnectAttempt++
    reconnectTimer = setTimeout(connect, delay)
  }

  function addPtyListener<T>(
    map: Map<string, Set<Listener<T>>>,
    ptyId: string,
    cb: Listener<T>,
  ): Unsubscribe {
    const hadListeners = hasPtyListeners(ptyId)
    let set = map.get(ptyId)
    if (!set) {
      set = new Set()
      map.set(ptyId, set)
    }
    set.add(cb)

    if (!hadListeners) send({ type: 'pty:subscribe', ptyId })

    return () => {
      set!.delete(cb)
      if (set!.size === 0) map.delete(ptyId)
      if (!hasPtyListeners(ptyId)) send({ type: 'pty:unsubscribe', ptyId })
    }
  }

  async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const opts: RequestInit = {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }
    const res = await fetch(`${apiBase}${path}`, opts)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`${method} ${path}: ${res.status} ${text}`)
    }
    const contentType = res.headers.get('content-type')
    if (contentType?.includes('application/json')) return res.json() as Promise<T>
    return undefined as T
  }

  connect()

  const adapter: PlatformAdapter = {
    git: {
      getStatus: (repoPath) => api('POST', '/git/status', { repoPath }),
      getDiff: (repoPath, staged) => api('POST', '/git/diff', { repoPath, staged }),
      getFileDiff: (repoPath, filePath) => api('POST', '/git/file-diff', { repoPath, filePath }),
      getBranches: (repoPath) => api('POST', '/git/branches', { repoPath }),
      stage: (repoPath, paths) => api('POST', '/git/stage', { repoPath, paths }),
      unstage: (repoPath, paths) => api('POST', '/git/unstage', { repoPath, paths }),
      discard: (repoPath, paths, untracked) =>
        api('POST', '/git/discard', { repoPath, paths, untracked }),
      commit: (repoPath, message) => api('POST', '/git/commit', { repoPath, message }),
      getCurrentBranch: (repoPath) =>
        api<{ branch: string }>('POST', '/git/current-branch', { repoPath }).then((r) => r.branch),
      isGitRepo: (dirPath) =>
        api<{ isRepo: boolean }>('POST', '/git/is-repo', { dirPath }).then((r) => r.isRepo),
      cloneBare: (url, targetDir) => api('POST', '/git/clone-bare', { url, targetDir }),
      getParentBranch: (repoPath, branch) =>
        api<{ parent: string }>('POST', '/git/parent-branch', { repoPath, branch }).then(
          (r) => r.parent,
        ),
    },
    pty: {
      create: (workingDir, shell, extraEnv, command) =>
        api<{ ptyId: string }>('POST', '/pty', { workingDir, shell, extraEnv, command }).then(
          (r) => r.ptyId,
        ),
      write: (ptyId, data) => send({ type: 'pty:write', ptyId, data }),
      resize: (ptyId, cols, rows) => send({ type: 'pty:resize', ptyId, cols, rows }),
      destroy: (ptyId) => {
        api('DELETE', `/pty/${ptyId}`)
      },
      list: () => api('GET', '/pty'),
      getBuffer: (ptyId) =>
        api<{ buffer: string }>('GET', `/pty/${ptyId}/buffer`).then((r) => r.buffer),
      onData: (ptyId, cb) => addPtyListener(ptyDataListeners, ptyId, cb),
      onTitle: (ptyId, cb) => addPtyListener(ptyTitleListeners, ptyId, cb),
      onFirstInput: (ptyId, cb) => addPtyListener(ptyFirstInputListeners, ptyId, cb),
      onExit: (ptyId, cb) => addPtyListener(ptyExitListeners, ptyId, cb),
    },
    fs: {
      readFile: (filePath) => api('POST', '/fs/read', { filePath }),
      writeFile: (filePath, content) => api('POST', '/fs/write', { filePath, content }),
    },
    app: {
      selectDirectory: () => Promise.resolve(null),
      addProjectPath: () => Promise.resolve(),
      getDataPath: () =>
        api<{ path: string }>('GET', '/app/parlour-path').then((r) => r.path),
      getParlourPath: () =>
        api<{ path: string }>('GET', '/app/parlour-path').then((r) => r.path),
      discoverOpeners: () => api('GET', '/app/openers'),
      openIn: (openerId, dirPath) => api('POST', '/app/open-in', { openerId, dirPath }),
    },
    chat: {
      createDir: (chatId, parentDirPath) =>
        api<{ dirPath: string }>('POST', '/chat-workspace/create-dir', {
          chatId,
          parentDirPath,
        }).then((r) => r.dirPath),
      removeDir: (chatId) => api('POST', '/chat-workspace/remove-dir', { chatId }),
      writeAgentsMd: (chatDir) => api('POST', '/chat-workspace/write-agents', { chatDir }),
      generateTitle: (prompt, llmCommand) =>
        api<{ title: string | null }>('POST', '/chat-workspace/generate-title', {
          prompt,
          llmCommand,
        }).then((r) => r.title),
      summarizeContext: (ptyId) =>
        api<{ summary: string | null }>('POST', '/chat-workspace/summarize', { ptyId }).then(
          (r) => r.summary,
        ),
      notifyParent: (parentPtyId, message) =>
        api('POST', '/chat-workspace/notify-parent', { parentPtyId, message }),
      getSessionId: (chatDir) =>
        api<{ sessionId: string | null }>('POST', '/chat-workspace/session-id', { chatDir }).then(
          (r) => r.sessionId,
        ),
    },
    schedules: {
      list: () => api('GET', '/schedules'),
      create: (opts) => api('POST', '/schedules', opts),
      delete: (id) => api('POST', `/schedules/${id}`, { action: 'cancel' }),
      toggle: (id) => api('POST', `/schedules/${id}/toggle`),
      update: (id, partial) => api('PATCH', `/schedules/${id}`, partial),
      runNow: (id) => api('POST', `/schedules/${id}/run`),
      onChanged: (cb) => {
        scheduleListeners.add(cb)
        if (!stateSubscribed) {
          stateSubscribed = true
          send({ type: 'state:subscribe' })
        }
        return () => {
          scheduleListeners.delete(cb)
        }
      },
    },
    github: {
      getPrStatuses: (repoPath, branches) =>
        api('POST', '/github/pr-statuses', { repoPath, branches }),
    },
    shell: {
      runCommand: (command, cwd) => api('POST', '/shell/run', { command, cwd }),
      openExternal: (url) => api('POST', '/shell/open-external', { url }),
    },
    api: {
      getPort: () => {
        const port = parseInt(new URL(serverUrl).port, 10)
        return Promise.resolve(port)
      },
    },
    chatRegistry: {
      getState: () => api('GET', '/chats'),
      onStateChanged: (cb) => {
        stateListeners.add(cb)
        if (!stateSubscribed) {
          stateSubscribed = true
          send({ type: 'state:subscribe' })
        }
        return () => {
          stateListeners.delete(cb)
        }
      },
      update: (id, partial) => api('PATCH', `/chats/${id}`, partial),
      create: (opts) => api('POST', '/chats', opts),
      createChild: (parentId, opts) => api('POST', `/chats/${parentId}/child`, opts),
      resume: (chatId) => api('POST', `/chats/${chatId}/resume`),
      delete: (chatId) => api('DELETE', `/chats/${chatId}`),
      retitle: (chatId) => api('POST', `/chats/${chatId}/retitle`),
    },
    cli: {
      detect: () => api('GET', '/cli/detect'),
      baseDefaults: () => api('GET', '/cli/defaults'),
    },
    theme: {
      setMode: (mode) => api('POST', '/theme/mode', { mode }),
      setResolved: (resolved) => send({ type: 'theme:resolved', resolved }),
      onResolvedChanged: (cb) => {
        themeListeners.add(cb)
        return () => {
          themeListeners.delete(cb)
        }
      },
    },
    state: {
      save: (data) => api('POST', '/state/save', { data }),
      load: () => api('GET', '/state/load'),
    },
  }

  if (overrides) {
    for (const key of Object.keys(overrides) as (keyof PlatformAdapter)[]) {
      ;(adapter[key] as PlatformAdapter[typeof key]) = overrides[key]!
    }
  }

  return adapter
}
