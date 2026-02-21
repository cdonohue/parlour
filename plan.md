# Plan: Add Cloud Sessions to Parlour

## Overview

Add support for cloud-hosted agent sessions alongside existing local terminal sessions. Cloud sessions run on a remote server instead of spawning a local PTY process, while sharing the same UI (terminal view, sidebar, harness tracking).

## Architecture

### Key Insight: The PTY Adapter Bridge

The existing `PlatformAdapter.pty` interface (`create`, `write`, `resize`, `onData`, `onExit`, etc.) is already abstract enough to support cloud sessions. The strategy is to make the **server** distinguish between local and cloud sessions at the `ChatRegistry` level, while keeping the renderer/UI unchanged — it still subscribes to PTY data streams via WebSocket regardless of where the session runs.

### Session Types

```
sessionType: 'local' | 'cloud'
```

- **Local (existing)**: Spawns a local PTY via `node-pty`, runs the LLM CLI process on the host machine.
- **Cloud**: Connects to a remote session via HTTP/WebSocket. The server acts as a proxy — it creates a "virtual PTY" that bridges remote session I/O into the existing PTY data stream protocol.

## Changes

### 1. Data Model (`ChatRecord`, `Chat` types)

**Files**: `packages/server/src/chat-registry.ts`, `packages/ui/src/types.ts`, `packages/app/src/store/types.ts`

- Add `sessionType?: 'local' | 'cloud'` to `ChatRecord` (server) and `Chat` (UI)
- Add `cloudSessionId?: string` to `ChatRecord` for tracking the remote session ID
- Add `cloudProvider?: string` to `ChatRecord` for multi-provider support (defaults to `'claude'`)

### 2. Cloud Session Manager (new module)

**New file**: `packages/server/src/cloud-session-manager.ts`

A new service that manages cloud session lifecycle, parallel to `PtyManager` for local sessions:

- `createSession(opts)` — Creates a remote session (e.g., via Claude API), returns a session ID
- `resumeSession(sessionId)` — Reconnects to an existing remote session
- `sendMessage(sessionId, message)` — Sends user input to the remote session
- `onOutput(sessionId, callback)` — Subscribes to session output stream
- `destroySession(sessionId)` — Terminates the remote session
- `getBuffer(sessionId)` — Returns buffered output

Internally, this bridges to the PTY protocol by:
1. Registering a "virtual PTY ID" in the PTY namespace
2. Pumping remote output into the same `pty:data` WebSocket messages
3. Translating `pty:write` messages into API calls to the remote session

### 3. ChatRegistry Changes

**File**: `packages/server/src/chat-registry.ts`

Modify `createChat()` and `createChildChat()` to branch on `sessionType`:

```
if (sessionType === 'cloud') {
  // 1. Create cloud session via CloudSessionManager
  // 2. Register virtual PTY with output bridging
  // 3. Skip local dir creation, AGENTS.md, CLI config
} else {
  // Existing local PTY path (unchanged)
}
```

Similarly for `resumeChat()`, `deleteChat()`, exit handling.

### 4. Agent Adapter for Cloud

**File**: `packages/server/src/agent-adapter.ts`

Add a `CloudClaudeAdapter` (or similar) to the adapter registry. This adapter:
- Returns empty config generation (no local files needed)
- Provides a cloud-specific parser for harness tracking
- Handles cloud session resume semantics

### 5. API & WebSocket Protocol

**Files**: `packages/api-types/src/ws-protocol.ts`, `packages/server/src/api-server.ts`

- Add `sessionType` to the `POST /api/chats` request body
- Cloud sessions still use `pty:subscribe`/`pty:data` over WebSocket (the virtual PTY bridge makes this transparent)
- Add `GET /api/cloud/sessions` for listing available cloud sessions to reconnect to

### 6. CreateChatOpts

**File**: `packages/server/src/chat-registry.ts`

Add `sessionType?: 'local' | 'cloud'` to `CreateChatOpts`.

### 7. UI: NewChatDialog

**File**: `packages/ui/src/components/NewChatDialog/NewChatDialog.tsx`

Add a session type toggle/selector:
- Two options: "Local Terminal" (default) and "Cloud Session"
- When cloud is selected, the agent field could be pre-populated or hidden (cloud provider determines the agent)
- Pass `sessionType` through `NewChatConfig` → `createNewChat()` → `adapter.chatRegistry.create()`

### 8. UI: ChatItem Badge

**File**: `packages/ui/src/components/ChatItem/ChatItem.tsx`

Show a small indicator (e.g., cloud icon) next to the LLM badge when `sessionType === 'cloud'`.

### 9. Settings

**File**: `packages/ui/src/types.ts`

Add cloud configuration to `Settings`:
- `cloudApiKey?: string` — API key for cloud sessions
- `defaultSessionType?: 'local' | 'cloud'` — Default for new chats

### 10. ParlourService Passthrough

**File**: `packages/server/src/parlour-service.ts`

Pass `sessionType` through `createChat()` and `createChildChat()` to `ChatRegistry`.

## Implementation Order

1. Data model changes (ChatRecord, Chat, CreateChatOpts)
2. CloudSessionManager stub with interface
3. ChatRegistry branching logic
4. Virtual PTY bridge (cloud output → pty:data)
5. API route updates
6. UI: NewChatDialog session type selector
7. UI: ChatItem cloud indicator
8. Settings additions
9. Concrete cloud provider implementation (Claude API)
10. Harness tracking for cloud sessions

## What Stays Unchanged

- **Terminal rendering**: xterm.js receives `pty:data` regardless of source
- **Sidebar/chat list**: Same component, just shows a badge
- **Lifecycle events**: Cloud sessions emit the same events
- **State persistence**: Zustand store treats cloud chats the same
- **WebSocket transport**: Virtual PTY bridge makes it transparent
