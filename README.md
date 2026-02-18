# Parlour

An app for orchestrating AI coding agents in parallel. Spawn multiple agent sessions, each with its own terminal and git worktree, and let them coordinate via MCP.

## Features

- Run multiple AI agent sessions in parallel, each in an isolated git worktree
- Full terminal emulator (xterm.js + node-pty) — the terminal is the primary interface
- Built-in MCP server for agent-to-agent orchestration and dispatch
- Works with any CLI-based agent (Claude, Gemini, Codex, OpenCode, or custom)
- Git worktree management — automatic creation and cleanup
- Cron-based automation scheduling
- Session resume with terminal buffer persistence
- Keyboard-driven workflow

## Getting started

Requires macOS and [Bun](https://bun.sh).

```bash
bun install
bun run dev
```

### Targets

| Target | Command | Description |
|--------|---------|-------------|
| Browser | `bun run dev:server && bun run dev:browser` | Standalone server + Vite HMR |
| Tauri | `cd tauri && bunx tauri dev` | Rust sidecar, native window |

### Test

```bash
bun run check     # Typecheck + unit tests
bun run test      # All test layers
```
