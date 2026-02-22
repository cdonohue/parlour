# Extract Standalone Server + WebSocket Transport

Status: **Planned**

Supersedes: [Phase C: Tauri Desktop Shell](./phase-c-tauri.md)

## Context

Chorale's backend services live in `desktop/src/main/` and are 90% pure Node.js, but coupled to Electron through 3 points: PtyManager stores `WebContents` for IPC data push, ChatRegistry imports `BrowserWindow`/`nativeTheme` for state push and theme detection, TaskScheduler imports `BrowserWindow` for schedule push.

The goal: **one transport (WebSocket), one adapter, everywhere**. PTYs always live behind a WebSocket server. Electron/Tauri spawn it as a sidecar. Browser connects directly. Cloud is just a different URL. Sessions survive app restarts because the server holds them.

**This supersedes the Phase C Tauri spec** (`docs/specs/phase-c-tauri.md`). That spec proposed rewriting PTY/git/chat-registry in Rust with Tauri IPC. The WebSocket approach eliminates that — Tauri spawns the same Node.js server and connects via WebSocket, identical to every other target.

## Architecture

```
┌─────────────┐  ┌──────────┐  ┌─────────┐  ┌───────────┐
│  Electron   │  │  Tauri   │  │ Browser │  │   Cloud   │
│  (sidecar)  │  │(sidecar) │  │  (dev)  │  │  (remote) │
└──────┬──────┘  └────┬─────┘  └────┬────┘  └─────┬─────┘
       │              │             │              │
       └──────────────┴──────┬──────┴──────────────┘
                             │
                    WebSocketPlatformAdapter
                      (HTTP + WebSocket)
                             │
                    ┌────────┴────────┐
                    │  @chorale/server │
                    │  HTTP REST + WS  │
                    └─────────────────┘
```

- **WebSocket** — PTY data streaming (bidirectional), state push, theme changes, lifecycle events
- **HTTP REST** — request/response operations (create chat, git ops, file I/O, etc.)
- **chorale CLI** — unchanged, still uses HTTP REST

## Target Matrix

| Target | Server | Native overrides | Use case |
|--------|--------|-----------------|----------|
| **Electron** | Sidecar (child process) | `dialog.showOpenDialog`, `shell.openExternal`, `nativeTheme` | Current desktop app |
| **Tauri** | Sidecar (`@tauri-apps/plugin-shell`) | `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-opener`, `window.theme()` | Future desktop (~15MB) |
| **Browser** | External (user starts separately, or dev script) | `window.matchMedia` for theme, no native dialogs (uses `<input type="file">` fallback) | Dev/testing, simple local use |
| **Cloud** | Remote container | Same as Browser | Remote sessions, team use |

Every target uses the same `WebSocketPlatformAdapter`. The only difference is:
1. **Who starts the server** — sidecar vs external vs remote
2. **What URL** — `ws://localhost:PORT/ws` vs `wss://cloud.example.com/ws`
3. **Native overrides** — platform-specific dialog/shell/theme (optional, graceful fallback)

### Session Portability

Sessions live on the server, not the client. This means:
- Start a chat in Electron → open browser → same sessions, same terminal output
- Server runs independently of any client → close all windows, sessions persist
- Cloud server = same sessions from any device, any target
- Local + cloud simultaneously = two different `WebSocketPlatformAdapter` instances pointing at different URLs (multi-server UI is a future feature, not in this plan)

## Dev Experience

After this plan is implemented, the full local dev loop is:

```bash
# Terminal 1: start the server (real PTYs, real git, real state)
bun run dev:server
# → prints PORT=12345, logs all requests to stdout

# Terminal 2: start the browser app (HMR, React DevTools)
bun run dev:browser
# → opens http://localhost:5173?port=12345
```

**Full transparency:**
- Chrome DevTools Network tab → every HTTP request to the server
- Chrome DevTools Network tab → WebSocket frames visible (filter `WS`)
- Server stdout → structured logs of every operation
- `window.__store` → Zustand state in console
- React DevTools → component tree inspection
- No hidden IPC, no Electron main process — everything is HTTP/WS and inspectable

## Phase 1: Decouple services from Electron (in place)

Refactor within `desktop/src/main/` so behavior is identical but Electron imports are removed.

### `pty-manager.ts`
- Remove `WebContents` from `PtyInstance`, remove `import { WebContents } from 'electron'`
- Replace `webContents.send(PTY_DATA, data)` with existing `onOutputCallbacks` array (already present)
- Add `onTitleCallbacks` and `onFirstInputCallbacks` arrays alongside existing `onExitCallbacks`
- Replace `webContents.send(PTY_TITLE, title)` → call `onTitleCallbacks`
- Replace `webContents.send(PTY_FIRST_INPUT, input)` → call `onFirstInputCallbacks`
- Remove `reattach()` WebContents swap (reconnection handled at WS layer)

### `chat-registry.ts`
- Remove `import { BrowserWindow, nativeTheme } from 'electron'`
- Constructor takes `getTheme: () => 'dark' | 'light'` callback — replaces `nativeTheme.shouldUseDarkColors`
- Constructor takes `onStateChanged: (state) => void` callback — replaces `pushToRenderer()` with `BrowserWindow.getAllWindows()`
- Remove `getWebContents()` method

### `task-scheduler.ts`
- Remove `import { BrowserWindow } from 'electron'`
- Constructor takes `onSchedulesChanged: (schedules) => void` callback — replaces `pushToRenderer()`

### `index.ts`
- Wire callbacks to existing IPC push so Electron behavior is unchanged:
  - `onStateChanged` → `BrowserWindow.getAllWindows().forEach(w => w.webContents.send(...))`
  - `getTheme` → `() => nativeTheme.shouldUseDarkColors ? 'dark' : 'light'`
  - `onSchedulesChanged` → IPC broadcast

### Verification
- `bun run dev` — Electron app works identically
- `bun run test` — all tests pass

## Phase 2: Create `packages/server/`

Move decoupled services into a new standalone server package.

### Files that copy verbatim (pure Node.js)
- `lifecycle.ts`, `logger.ts`, `config-service.ts`, `git-service.ts`
- `harness-parser.ts`, `harness-tracker.ts`
- `chorale-service.ts`, `chorale-dirs.ts`
- `cli-config.ts`, `cli-detect.ts`, `claude-config.ts`
- `file-service.ts`, `forge-service.ts`

### Files that copy post-Phase 1 refactor
- `pty-manager.ts`, `chat-registry.ts`, `task-scheduler.ts`, `api-server.ts`

### New: `packages/server/src/index.ts`
- Parse CLI args: `--port` (default 0 = random), `--data-dir` (default `~/.chorale`)
- Create all services, wire dependencies
- `ChatRegistry.loadFromDisk()`, reconcile PTYs
- `TaskScheduler.loadAndStart()`
- Start HTTP server, print `PORT={n}` to stdout
- Write port to `~/.chorale/.mcp-port`
- SIGTERM handler: flush state, destroy PTYs, exit

### New: `packages/server/src/theme-manager.ts`
- Maintains `mode` (system/dark/light) and `resolved` (dark/light)
- Server-side: `system` defaults to `dark` (no OS API)
- Clients can push resolved theme from their native API

### Verification
- `node packages/server/dist/index.js` starts, prints port
- `chorale status` works against standalone server
- `curl localhost:PORT/api/health` returns OK

## Phase 3: WebSocket protocol + server

### Message types (`packages/api-types/src/ws-protocol.ts`)

```
C2S (client → server):
  pty:subscribe     { ptyId }           — start receiving data for this PTY
  pty:unsubscribe   { ptyId }           — stop
  pty:write         { ptyId, data }     — send input
  pty:resize        { ptyId, cols, rows }
  state:subscribe                       — receive chat + schedule pushes
  events:subscribe  { filters? }        — receive lifecycle events
  theme:set         { mode }            — set theme mode
  theme:resolved    { resolved }        — client pushes native resolution

S2C (server → client):
  pty:data          { ptyId, data }     — output chunk
  pty:buffer        { ptyId, data }     — full buffer on subscribe
  pty:title         { ptyId, title }
  pty:exit          { ptyId, exitCode }
  state:chats       { chats }
  state:schedules   { schedules }
  theme:resolved    { resolved }
  event             { event }           — lifecycle event
  hello             { version }
```

### `packages/server/src/ws-server.ts`
- `WebSocketServer` mounted at `/ws` on existing HTTP server
- Per-client tracking: `ptySubscriptions: Set<string>`, `stateSubscribed`, `eventsSubscribed`
- On `pty:subscribe`: register callback on PtyManager, send `pty:buffer` immediately
- On `pty:write`/`pty:resize`: forward to PtyManager (fire-and-forget)
- ChatRegistry `onStateChanged` → broadcast `state:chats` to subscribed clients
- TaskScheduler `onSchedulesChanged` → broadcast `state:schedules`
- Lifecycle wildcard → broadcast `event` to subscribed clients
- Client disconnect → clean up all PTY subscriptions

### Verification
- `wscat -c ws://localhost:PORT/ws` → receives `hello`
- Send `{"type":"state:subscribe"}` → receives chat state
- Send `{"type":"pty:subscribe","ptyId":"..."}` → receives buffer + live data

## Phase 4: Expand REST API

Add endpoints for all `PlatformAdapter` operations not covered by existing routes:

| Area | Endpoints |
|------|-----------|
| PTY | `POST /api/pty/create`, `DELETE /api/pty/:id`, `GET /api/pty`, `GET /api/pty/:id/buffer` |
| Chat Registry | `GET /api/chat-registry/state`, `POST .../create`, `POST .../create-child`, `POST .../:id/resume`, `DELETE .../:id`, `PATCH .../:id`, `POST .../:id/retitle` |
| Git | `GET /api/git/status`, `GET .../diff`, `POST .../stage`, `POST .../commit`, etc. |
| FS | `GET /api/fs/read`, `POST /api/fs/write` |
| App | `GET /api/app/data-path`, `GET .../chorale-path`, `GET .../openers`, `POST .../open-in` |
| Shell | `POST /api/shell/run` |
| CLI | `GET /api/cli/detect`, `GET /api/cli/base-defaults` |
| State | `POST /api/state/save`, `GET /api/state/load` |
| GitHub | `GET /api/github/pr-statuses` |
| Theme | `POST /api/theme/set` |

Pattern: thin handlers calling existing service methods. Same style as current `api-server.ts`.

Platform-specific ops (`selectDirectory`, `openExternal`) return 501 from server — overridden client-side.

### Verification
- `curl` each new endpoint, verify responses
- `chorale-cli` still works (existing routes unchanged)

## Phase 5: `WebSocketPlatformAdapter` (client-side)

### `packages/platform/src/ws-adapter.ts`

`createWebSocketAdapter(serverUrl: string, overrides?: Partial<PlatformAdapter>): PlatformAdapter`

- Opens WebSocket to `{serverUrl}/ws`
- Sends `state:subscribe` + `theme:subscribe` on connect
- Maintains listener registries: `Map<ptyId, Set<callback>>` for data/title/exit
- `pty.onData(ptyId, cb)` → adds to registry, sends `pty:subscribe` if first listener
- `pty.write(ptyId, data)` → sends `pty:write` over WS (fire-and-forget)
- All request/response methods → `fetch()` to HTTP REST
- Auto-reconnect on close: re-subscribe to all active PTYs and state
- `overrides` param allows Electron/Tauri to inject native `selectDirectory`, `openExternal`, etc.

### Update `packages/app/dev/main.tsx`
- Replace `createMockAdapter()` with `createWebSocketAdapter('ws://localhost:PORT')`
- Read port from env var or query string: `CHORALE_PORT` or `?port=`

### Verification
- Start server: `bun run server`
- Start browser: `bun run dev:browser`
- Browser shows real chats from server, live terminal streaming works
- Create new chat → terminal appears with live PTY output
- Resize browser → terminal resizes
- Close/reopen browser tab → reconnects, terminal buffer replays

## Phase 5b: Testing Infrastructure + Turborepo

### Turborepo setup

Add `turbo` as a root devDependency and create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "out/**"]
    },
    "dev": {
      "persistent": true,
      "cache": false
    },
    "dev:server": {
      "persistent": true,
      "cache": false
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test:unit": {
      "dependsOn": ["^build"]
    },
    "test:integration": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "test:e2e": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

Root `package.json` script updates:
```json
{
  "dev": "turbo dev --filter=desktop",
  "dev:server": "turbo dev:server --filter=@chorale/server",
  "dev:browser": "turbo dev --filter=@chorale/app",
  "build": "turbo build",
  "check": "turbo typecheck && bunx vitest run",
  "typecheck": "turbo typecheck",
  "test": "turbo test:unit test:integration test:e2e",
  "test:unit": "bunx vitest run",
  "test:integration": "turbo test:integration",
  "test:e2e": "turbo test:e2e"
}
```

`check` is the primary LLM feedback command — typecheck all packages in parallel (turbo-cached), then run vitest unit tests. Fast enough to run after every change.

### Test layer 1: Server integration tests

Location: `packages/server/src/__tests__/api-server.test.ts`

Spin up a real `ApiServer` + services in-process (no child process, no network race). Hit every REST endpoint, verify responses.

Test fixture:
- `beforeAll`: create temp data dir, instantiate PtyManager + ChatRegistry + TaskScheduler + ThemeManager + ChoraleService + ApiServer, call `server.start()`
- `afterAll`: `server.stop()`, cleanup temp dir

Coverage:
- Health check
- Git routes (use a temp git repo fixture): status, diff, branches, stage, commit, is-repo, current-branch
- Chat registry: create → get state → update → retitle → delete
- PTY: create → list → get buffer → destroy
- CLI: detect, defaults
- State: save → load round-trip
- Theme: set mode → verify response
- App: data-path, chorale-path, openers
- Schedule: create → toggle → update → cancel
- File: write → read round-trip

Test runner: vitest (already configured at root, add `packages/server/src/__tests__/` to include glob — already matches).

### Test layer 2: WebSocket protocol tests

Location: `packages/server/src/__tests__/ws-protocol.test.ts`

Same in-process server fixture. Connect a raw `ws` WebSocket client.

Coverage:
- Connect → receive `hello` message with version
- `state:subscribe` → receive `state:chats` + `state:schedules`
- PTY subscribe flow: create PTY via REST → `pty:subscribe` → receive `pty:buffer` → write to PTY → receive `pty:data`
- `pty:resize` → no error (fire-and-forget)
- `pty:unsubscribe` → stop receiving data
- `events:subscribe` → create chat via REST → receive lifecycle `event`
- `theme:resolved` client→server → broadcast to other clients
- Client disconnect → no crash, cleanup
- Multiple clients subscribing to same PTY

### Test layer 3: Browser e2e (Playwright)

Location: `e2e/` (root level, not desktop-specific)

New Playwright config at root: `playwright.config.ts` with a `browser` project that runs `dev:server` as a webServer dependency.

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 1,
  projects: [
    {
      name: 'browser',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'bun run dev:test',  // starts server + browser app
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
```

`dev:test` script: starts `@chorale/server` on a fixed port, then `@chorale/app` Vite dev server pointing at it. Turbo orchestrates both.

Test cases:
- App loads, sidebar visible
- Create new chat → terminal appears
- Terminal receives PTY output (verify xterm has content)
- Type in terminal → input reaches PTY
- Chat appears in sidebar after creation
- Delete chat → removed from sidebar
- Settings panel opens/closes
- Theme toggle → UI updates
- Automations panel: create schedule → appears in list
- Multi-tab: open second tab → both show same chats
- Reconnect: disconnect WS → reconnects → state restored

### Test layer 4: CLI integration tests

Location: `chorale-cli/src/__tests__/integration.test.ts`

Start server in-process, write port file, run `chorale` CLI commands against it.

Coverage:
- `chorale status` → returns health
- `chorale dispatch "test"` → creates chat, returns ID
- `chorale list-children` → shows dispatched chat
- `chorale schedule list` → returns schedules
- `chorale hook harness:thinking` → emits event

### Verification

```bash
bun run check             # typecheck + unit tests (LLM feedback loop)
turbo test:integration    # vitest — server API + WS + CLI tests
turbo test:e2e            # playwright — browser e2e
bun run test              # all layers (unit + integration + e2e)
```

## Phase 7: Electron as sidecar launcher

### `desktop/src/main/index.ts`
- On `app.whenReady()`: spawn `@chorale/server` as child process
- Wait for `PORT=` on stdout
- Create `WebSocketPlatformAdapter` with Electron-native overrides:
  - `app.selectDirectory` → `dialog.showOpenDialog()`
  - `shell.openExternal` → `electron.shell.openExternal()`
  - `theme.onResolvedChanged` → `nativeTheme.on('updated')` + push to server
- Pass adapter to renderer via preload bridge
- `app.on('before-quit')` → POST `/api/shutdown`, kill child process

### Remove from `desktop/src/main/`
- All service files (now in `packages/server/`)
- `ipc.ts` handlers for services (replaced by adapter)
- Keep only: window management, native dialogs, nativeTheme bridge

### Root scripts
```json
{
  "dev:server": "bun run --cwd packages/server dev",
  "dev:browser": "bun run --cwd packages/app dev"
}
```

### Verification
- `bun run dev` → Electron spawns server, full app works
- `bun run dev:server` + `bun run dev:browser` → browser with real terminals
- `bun run test` passes
- Kill and restart Electron → reconnects to server, PTYs survive (if server runs independently)

## Phase 8: Tauri shell (future, enabled by Phases 1-5)

Not implemented in this plan, but the architecture makes it trivial. Tauri is a thin shell — no Rust reimplementation of services.

### `tauri/src/adapter.ts`
```typescript
const adapter = createWebSocketAdapter(`ws://localhost:${port}`, {
  app: {
    selectDirectory: () => tauriDialog.open({ directory: true }),
  },
  shell: {
    openExternal: (url) => tauriOpener.openUrl(url),
  },
  theme: {
    onResolvedChanged: (cb) => {
      const win = getCurrentWindow()
      win.theme().then(t => cb(t ?? 'dark'))
      return win.onThemeChanged(({ payload }) => cb(payload ?? 'dark'))
    },
  },
})
```

### `tauri/src-tauri/src/lib.rs`
- Spawn `@chorale/server` as sidecar via `@tauri-apps/plugin-shell`
- Wait for `PORT=` on stdout
- Load `tauri://localhost` webview pointing at bundled React app
- App reads server port from Tauri's `invoke()` bridge

### Why this is better than the Phase C Tauri spec
- **No Rust reimplementation** — no `portable-pty`, no `git2`, no Rust chat-registry
- **Same server binary** — one codebase for PTY/git/state across all targets
- **Sidecar now, Axum later** — can optionally rewrite server in Rust for single-binary distribution
- **~15MB** — Tauri shell + bundled JS server is still tiny vs Electron

## Key files

| File | Role |
|------|------|
| `desktop/src/main/pty-manager.ts` | Phase 1: decouple from WebContents |
| `desktop/src/main/chat-registry.ts` | Phase 1: inject callbacks, remove BrowserWindow |
| `desktop/src/main/task-scheduler.ts` | Phase 1: inject callback |
| `desktop/src/main/index.ts` | Phase 1: wire callbacks; Phase 7: sidecar launcher |
| `packages/api-types/src/ws-protocol.ts` | Phase 3: message types |
| `packages/server/src/index.ts` | Phase 2: server entry |
| `packages/server/src/ws-server.ts` | Phase 3: WebSocket handler |
| `packages/server/src/api-server.ts` | Phase 4: expanded REST routes |
| `packages/platform/src/ws-adapter.ts` | Phase 5: client adapter |
| `packages/app/dev/main.tsx` | Phase 5: switch from mock to real |
| `docs/specs/phase-c-tauri.md` | Superseded by Phase 8 approach |

## End-to-end verification (after Phase 7)

### Local dev (browser)
```bash
bun run dev:server          # → PORT=12345
bun run dev:browser         # → localhost:5173?port=12345
# Create chat → xterm shows real PTY
# Type in terminal → output streams back
# Close tab, reopen → reconnects, buffer replays
# Chrome DevTools WS tab → all messages visible
```

### Electron
```bash
bun run dev                 # → Electron spawns server, full app
# Same behavior as current app
# Kill Electron → server dies (child process)
```

### CLI
```bash
bun run dev:server          # server running
chorale status              # works against standalone server
chorale dispatch "test"     # creates chat, visible in browser
```

### Multi-client
```bash
bun run dev:server          # one server
# Open 2 browser tabs → both see same chats
# Create chat in tab 1 → appears in tab 2 via state:chats push
# Type in terminal in tab 1 → output visible in tab 2 (if subscribed to same PTY)
```
