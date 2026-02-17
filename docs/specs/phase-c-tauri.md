# Phase C: Tauri Desktop Shell

Status: **Planned** (depends on Phase B completion)

Replace Electron with Tauri for an ~8x smaller binary (~15MB vs ~120MB). The React app (`@parlour/app`) works unchanged — only the adapter and backend change.

## Prerequisites

- `@parlour/app` fully extracted behind `PlatformAdapter` (Phase B, done)
- `@parlour/api-types` shared contract (Phase B, done)
- `parlour` CLI working against HTTP backend (Phase A, done)

## C1. Rust PTY Backend

Replace `node-pty` with `portable-pty` crate. Tauri command handlers:

```rust
#[tauri::command]
async fn pty_create(working_dir: String, command: Vec<String>, env: HashMap<String, String>) -> Result<String, String> {
    let pair = portable_pty::native_pty_system().openpty(PtySize { rows: 24, cols: 80, .. })?;
    let child = pair.slave.spawn_command(CommandBuilder::from_argv(command))?;
    // Store in global state, return pty_id
}

#[tauri::command]
fn pty_write(pty_id: String, data: String) -> Result<(), String> { ... }

#[tauri::command]
fn pty_resize(pty_id: String, cols: u16, rows: u16) -> Result<(), String> { ... }
```

PTY output pushed via Tauri events:
```rust
app.emit_to("main", &format!("pty:data:{}", pty_id), data)?;
```

## C2. Git Operations

Replace `execFileAsync('git', ...)` with `git2` crate for common ops (status, diff, branch, commit). Fall back to `git` CLI for complex ops (worktree, clone).

## C3. Tauri PlatformAdapter

```typescript
function createTauriAdapter(): PlatformAdapter {
  return {
    pty: {
      create: (dir, shell, env, cmd) => invoke('pty_create', { workingDir: dir, command: cmd, env }),
      write: (id, data) => invoke('pty_write', { ptyId: id, data }),
      onData: (id, cb) => listen(`pty:data:${id}`, (e) => cb(e.payload)),
      onExit: (id, cb) => listen(`pty:exit:${id}`, (e) => cb(e.payload)),
      // ...
    },
    git: {
      getStatus: (path) => invoke('git_status', { repoPath: path }),
      // ...
    },
    chatRegistry: {
      getState: () => invoke('chat_registry_get_state'),
      onStateChanged: (cb) => listen('chat-registry:state-changed', (e) => cb(e.payload)),
      // ...
    },
    state: {
      save: (data) => invoke('state_save', { data }),
      load: () => invoke('state_load'),
    },
    // ...
  }
}
```

## C4. API Server as Sidecar

`parlour` CLI needs the HTTP backend. Two options:
1. **Sidecar**: Bundle the Node.js API server as a Tauri sidecar process
2. **Rewrite in Rust**: Implement routes in Axum, sharing Rust state with Tauri commands

Sidecar is faster to ship. Axum is the long-term target.

## C5. Migration Path

1. `@parlour/app` works unchanged — just swap adapter
2. Rust backend implements same operations as main process services
3. Tauri entry point: `createTauriAdapter()` → `initApp(adapter)` → render
4. `parlour` CLI works unchanged — same HTTP contract

## C6. Binary Size

Tauri + portable-pty + git2: ~15MB (vs ~120MB Electron).

## C7. File Structure

```
tauri/
  src-tauri/
    src/
      main.rs            # Tauri app setup
      pty.rs             # portable-pty wrapper + commands
      git.rs             # git2 + CLI fallback
      chat_registry.rs   # Chat lifecycle (port of chat-registry.ts)
      api_server.rs      # Axum HTTP backend (or sidecar config)
      parlour_dirs.rs    # Filesystem structure
    Cargo.toml
    tauri.conf.json
  src/
    adapter.ts           # createTauriAdapter()
    main.tsx             # Entry point (~30 lines)
```

## Open Questions

- Sidecar vs native Axum for API server — tradeoff is speed-to-ship vs long-term maintenance
- macOS code signing for Tauri (notarization flow differs from Electron)
- Whether `git2` crate covers enough of our git ops or if shelling out to `git` is simpler
