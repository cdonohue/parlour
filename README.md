# Parlour

A macOS desktop app for orchestrating AI coding agents in parallel. Spawn multiple agent sessions, each with its own terminal and git worktree, and let them coordinate via MCP.

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

### Build and package

```bash
bun run build     # Production build
bun run dist      # Package as signed macOS DMG
```

### Test

```bash
bun run test      # Playwright e2e tests
```
