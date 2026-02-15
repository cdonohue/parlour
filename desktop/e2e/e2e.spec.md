# E2E Test Plan

## Infrastructure
- Playwright _electron adapter
- CI_TEST=1: temp userData, headless
- window.__store for state access
- Temp git repos in /tmp (realpathSync for macOS)
- workers: 1 (serial, window focus)

## Suites

### App Launch
- Starts without crash
- 2-pane layout (sidebar + content)
- Empty state when no chats
- Sidebar collapse/expand (Cmd+B)

### Chat Lifecycle
- Create chat (Cmd+N) → PTY spawns, terminal renders
- Chat in sidebar with auto-derived title
- Switch between chats
- Delete chat (Cmd+W) → PTY destroyed, removed
- Resume dead chat on relaunch

### Nested Chats
- Create child from parent
- Child inherits parent links
- Breadcrumbs render
- Delete parent cascades children
- Max depth enforced

### Terminal
- PTY write/read round-trip
- xterm renders output
- Terminal preserved on chat switch (visibility, not unmount)
- Shift+Tab sends correct escape sequence

### Keyboard Shortcuts
- Cmd+N: new chat
- Cmd+Shift+N: new chat with dialog
- Cmd+W: delete active chat
- Cmd+B: toggle sidebar
- Cmd+,: toggle settings
- Cmd+D: attach dialog
- Cmd+O: open in external app
- Cmd+=/-/0: font size

### Git Integration
- Worktree create/remove
- Stage/unstage/commit
- Branch listing

### Repos & Links
- Attach repo → worktree created, link in header
- Attach directory → symlink
- Detach link → cleanup

### Settings
- Open/close panel
- Changes persist across restart

### Automations
- Create cron schedule
- Create one-time schedule
- Toggle on/off
- Delete schedule

### State Persistence
- Chats + links survive quit/relaunch
- Dead PTYs reconciled on hydrate

### MCP Server
- Starts on launch, port file written
- dispatch creates child chat in sidebar
