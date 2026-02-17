# Parlour

macOS app for running AI agents in parallel with integrated terminal, git, and automation scheduling.

## Commands

All from repo root:

    bun run dev         # Dev server + Electron
    bun run build       # Production build
    bun run test        # Playwright e2e tests
    bun run rebuild     # Rebuild native modules (node-pty)
    bun run dist        # Package signed macOS DMG
    bun run storybook   # @parlour/ui component dev

## Repo Structure

    parlour/
    ├── packages/ui/            # @parlour/ui — presentational components, primitives, styles
    │   └── src/
    │       ├── components/     # Sidebar, HeaderBar, Terminal, Settings, Automations, etc.
    │       ├── primitives/     # Button, Toggle, TextInput, Dialog, Select, etc.
    │       ├── styles/         # CSS variables, tokens, fonts
    │       ├── utils/          # deriveShortTitle, describeCron
    │       └── types.ts        # Shared types (Chat, Repo, Link, Settings, etc.)
    ├── parlour-cli/            # Agent-facing CLI (parlour dispatch, status, hook, etc.)
    │   └── src/index.ts        # Single-file CLI, reads ~/.parlour/.mcp-port
    └── desktop/                # Electron app
        ├── src/main/           # Main process services
        ├── src/preload/        # contextBridge → window.api
        ├── src/renderer/       # React (store, connected wrappers, hooks)
        ├── src/shared/         # IPC channel constants
        └── e2e/                # Playwright tests

## Tech Stack

Electron 40 · React 19 · TypeScript · Zustand · xterm.js · node-pty · Allotment · electron-vite · Playwright · bun

## Architecture

### Process Model

Main (Node.js) ←IPC→ Preload (contextBridge) ←window.api→ Renderer (React)

Main process services:
- **ChatRegistry** — chat/link lifecycle (create, resume, delete, retitle), PTY exit listeners, harness tracking per chat, pushes state to renderer
- **PtyManager** — node-pty spawn, output buffer (200k cap), OSC title extraction
- **GitService** — all git ops via execFileAsync('git', ...)
- **GithubService** — `gh` CLI for PR status, 60s cache, silent degradation
- **FileService** — file read/write
- **ApiServer** — HTTP REST API for agent orchestration (api-server.ts), delegates to ParlourService
- **TaskScheduler** — croner cron/one-time jobs, delegates to ChatRegistry for execution
- **Logger** — structured JSON lines to `~/.parlour/logs/parlour.jsonl`, child loggers per service
- **Lifecycle** — typed event emitter for terminal, harness, and CLI events
- **HarnessTracker** — per-chat status state machine (idle/thinking/writing/tool-use/waiting/done/error)

Cross-cutting:
- **HarnessParser** — PTY output parser (Claude-specific + generic fallback) → emits HarnessEvents
- **CliConfig** — per-CLI config generation (Claude hooks, Gemini settings, Codex TOML, OpenCode JSON)

### IPC Flow

shared/ipc-channels.ts (constants) → main/ipc.ts (handlers) → preload/index.ts (bridge) → window.api.*

### UI Layout

2-pane Allotment layout: collapsible sidebar + content area.
Content has layered views toggled by visibility: chat terminal, automations, task detail.
The terminal is the primary interaction surface — no file editor, no tabs.

### @parlour/ui ↔ Connected Pattern

packages/ui/ exports presentational components (no store, no IPC calls).
desktop/src/renderer/connected/ has thin wrappers binding UI to the Zustand store.

### State

Split ownership:
- **ChatRegistry** (main process) owns chats + links → persisted to `~/.parlour/chat-registry.json` (debounced 500ms)
- **Zustand store** (renderer) owns repos, tasks, runs, settings, navigation → persisted to `parlour-state.json`

Push pattern: ChatRegistry mutates → persist → push `{chats, links}` to all windows via `CHAT_REGISTRY_STATE_CHANGED`.
Renderer receives pushes into Zustand. Optimistic local updates for UI-only fields (pin, active, unread).
On startup, ChatRegistry reconciles PTYs: dead PTYs → status failed, live PTYs → re-register exit listeners.
window.__store exposed in dev for testing.

### REST API + `parlour` CLI

HTTP on random localhost port → `~/.parlour/.mcp-port`.

Agents interact via `parlour` CLI (reads port file, uses `PARLOUR_CHAT_ID` from env):

    parlour dispatch "task description"       # spawn child chat
    parlour status [chatId]                   # chat status + harness state
    parlour list-children                     # list child chats
    parlour report "message"                  # send message to parent PTY
    parlour schedule list|cancel|run          # schedule management
    parlour project list|open                 # project management
    parlour hook <event> [--tool <name>]      # emit harness lifecycle event

API routes (all under `/api/`):

| Method | Path | Description |
|--------|------|-------------|
| POST | /dispatch | Create chat (child or root) |
| GET | /status/{chatId} | Status + harness state + terminal tail |
| GET | /children/{parentId} | List child chats |
| POST | /report | Write message to parent PTY |
| GET/POST | /schedules | List or create schedules |
| POST | /schedules/{id} | Cancel schedule |
| POST | /schedules/{id}/run | Run schedule now |
| GET | /projects/{chatId} | List chat projects |
| POST | /projects/open | Clone/checkout project |
| POST | /hooks | Harness lifecycle hooks |
| GET | /health | Health check |

Per-request caller context via `?caller={chatId}`. Every API call emits a CliEvent to the lifecycle emitter.

### Lifecycle Events

Three event streams feed into the lifecycle emitter (lifecycle.ts):

**Terminal events** — emitted by ChatRegistry and PtyManager:
- `chat:created`, `chat:resumed`, `chat:deleted`, `chat:status`
- `pty:spawned`, `pty:exit`
- `schedule:triggered`, `schedule:completed`

**Harness events** — from CLI hooks + output parser → HarnessTracker:
- `harness:tool:start`, `harness:tool:end`, `harness:stop`
- `harness:thinking`, `harness:writing`, `harness:waiting`
- `harness:status` (unified state change from HarnessTracker)

**CLI events** — emitted by ApiServer on every agent request:
- `cli:dispatch`, `cli:status`, `cli:schedule`, `cli:report`, `cli:project`, `cli:hook`

Subscribe with `lifecycle.on('*', handler)` for all events, or prefix like `lifecycle.on('harness:*', handler)`.

### Chat Lifecycle

All lifecycle managed by ChatRegistry in main process:
1. Create dir (~/.parlour/chats/{id}/)
2. Process attach (worktree create/clone, symlinks)
3. Write AGENTS.md + CLI config (hooks for Claude, settings for others)
4. Spawn PTY: `/bin/sh -c exec {llmCommand}`
5. Attach harness tracking (parser + tracker per chat)
6. Register PTY exit listener → saves terminal buffer to disk, updates status
7. On resume: spawn fresh LLM with CLI-specific resume flags, seed terminal buffer

TaskScheduler and ApiServer delegate to ChatRegistry instead of creating chats directly.
Nested chats: parent context summarized via claude CLI → injected into child AGENTS.md.
Max depth configurable (default: 2).

### Harness Tracking

Two complementary mechanisms per chat:

**CLI hooks** (Claude only): `.claude/settings.local.json` includes PreToolUse/PostToolUse/Stop hooks that call `parlour hook <event>`. Structured events — no parsing needed.

**Output parser** (all CLIs): `HarnessParser.feed()` on PTY output stream. `ClaudeOutputParser` detects tool boxes (╭─ ╰─), thinking spinners, cost summary. `GenericOutputParser` uses idle/burst heuristics.

Both feed into `HarnessTracker` which maintains per-chat state:
- Status: `idle | thinking | writing | tool-use | waiting | done | error`
- Current tool name, last activity timestamp, tools-used count
- Emits `harness:status` lifecycle event on state transitions

### Chat Resume

Two layers provide continuity when resuming a chat:

**Terminal buffer persistence** (universal, all CLIs):
- On PTY exit: buffer written to `{chatDir}/terminal-buffer`
- On app quit: `flushPersist()` saves all active buffers synchronously before PTYs die
- On resume: buffer read from disk and seeded into the new PTY via `seedBuffer()`
- Gives the user visual continuity — they see previous conversation output

**CLI-specific session resume** (restores LLM server-side context):
- Each CLI has resume flags defined in `CLI_REGISTRY` (cli-detect.ts)
- Claude: `--continue` (last session in cwd)
- Gemini: `--resume` (last session in cwd)
- Codex: `resume --last` (scoped to cwd)
- OpenCode: `--continue` (last session in cwd)
- Custom/unknown CLIs: fresh start (no resume args)
- No session ID tracking needed — each chat runs in a unique `~/.parlour/chats/{uuid}/` dir, so "resume last" always picks the right session

Adding a new CLI: add an entry to `CLI_REGISTRY` in `cli-detect.ts` with `resumeWithId` and `resumeLast`.

## Design Principle: UI/CLI Parity

Every action a human can perform through the UI must also be available to agents via `parlour` CLI.
Every piece of context visible to the user must be accessible to agents programmatically.
When adding features, implement both the UI surface and the corresponding CLI command / API route together.

## Observability

Structured logs to `~/.parlour/logs/parlour.jsonl` (JSON lines, rotated at 5MB).

All lifecycle events logged via wildcard subscriber in index.ts. Services use child loggers: `logger.child({ service: 'ChatRegistry' })`.

Inspect logs:
- `tail -f ~/.parlour/logs/parlour.jsonl | jq` — live stream
- `jq 'select(.type | startswith("harness"))' ~/.parlour/logs/parlour.jsonl` — filter harness
- `PARLOUR_LOG_LEVEL=debug bun run dev` — verbose console output

Agent introspection:
- `parlour status <chatId>` — chat status + harness state + last 4KB output
- `parlour list-children` — child chat statuses

## Implementation Workflow (mandatory)

Before writing any code, ALWAYS follow these steps in order:

1. **Search for prior art.** Grep/glob the codebase for existing implementations, patterns, utilities, or similar features. Understand how the codebase already solves related problems before inventing new approaches.
2. **Research.** Read the relevant files end-to-end. Understand the data flow, naming conventions, and architectural patterns already in use.
3. **Propose a plan.** Present the implementation approach to the user — what files you'll change, what patterns you'll follow, and any trade-offs. Wait for explicit user approval before writing code.

Never skip straight to coding. Getting alignment first avoids wasted work and keeps the codebase consistent.

## Key Patterns

- **Keyboard shortcuts**: `@tanstack/react-hotkeys` via `useShortcuts.ts`. Bindings stored in `settings.keybindings`, reassignable in Settings panel. Defaults in `DEFAULT_KEYBINDINGS` (types.ts).
- **Shift+Tab**: separate capture-phase handler (non-configurable), writes \x1b[Z to PTY
- **Terminal lifecycle**: visibility:hidden when inactive (preserves scrollback, not unmounted)
- **CSS modules**: mangled names — use [class*="name"] selectors in tests
- **Git errors**: friendly parsing in git-service.ts (BRANCH_CHECKED_OUT, BRANCH_ALREADY_EXISTS, etc.)

## File Map

### desktop/src/main/
    index.ts               App entry, window, service init, cleanup
    ipc.ts                 All IPC handlers, delegates to services
    chat-registry.ts       Chat/Link lifecycle, state push, harness tracking
    pty-manager.ts         PTY lifecycle, buffer, title extraction
    git-service.ts         Git ops (worktree, status, diff, branch, commit)
    github-service.ts      gh CLI PR status with cache
    file-service.ts        File read/write
    api-server.ts          HTTP REST API server (thin adapter over ParlourService)
    parlour-service.ts     Orchestration logic (dispatch, status, schedules, hooks)
    task-scheduler.ts      Cron/one-time job execution, delegates to ChatRegistry
    logger.ts              Structured JSON logger, child loggers, rotation
    lifecycle.ts           Typed event emitter (TerminalEvent, HarnessEvent, CliEvent)
    harness-parser.ts      PTY output parsers (ClaudeOutputParser, GenericOutputParser)
    harness-tracker.ts     Per-chat harness status state machine
    cli-config.ts          Per-CLI config generation (hooks, MCP, settings)
    config-service.ts      ~/.parlour/config.json (custom LLMs, global MCP servers)
    cli-detect.ts          CLI type detection + resume flags registry
    claude-config.ts       ~/.claude.json trust, settings
    parlour-dirs.ts        Chat dir creation, AGENTS.md gen, project scanning

### parlour-cli/
    src/index.ts           Agent-facing CLI (dispatch, status, hook, etc.)

### desktop/src/renderer/
    App.tsx                Root component, 2-pane Allotment
    store/app-store.ts     Zustand store
    store/types.ts         AppState interface
    connected/             Store-bound wrappers for @parlour/ui
    hooks/                 useShortcuts, usePrStatusPoller, useSchedules

### desktop/src/shared/
    ipc-channels.ts        IPC channel constants
    github-types.ts        PR/check types
