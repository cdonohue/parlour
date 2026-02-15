# Simplified Directory Model

## Summary

Replace the current attach/link/worktree/symlink system with a simpler model: chats own local clones in their own directory. No symlinks, no --add-dir, no mid-session attach, no PTY restarts. AGENTS.md is the universal interface for all LLMs.

## Concepts

Users interact with **3 things**: Chats, Projects (implicitly), Schedules.

- **Chat** — a conversation with an LLM. Optionally references projects.
- **Project** — not a top-level UI concept. Just something mentioned in conversation. Parlour manages clones/caches invisibly.
- **Schedule** — a prompt on a cron or one-time trigger.

## Filesystem Layout

```
~/.parlour/
  config.json                        # global settings, keybindings, global MCP servers
  bare/                              # shared bare clone cache
    grove.git
    other-repo.git

  llm-defaults/                      # per-CLI config templates
    claude/
      settings.local.json
    gemini/
      settings.json
    opencode/
      opencode.json

  chats/{id}/
    AGENTS.md                        # LLM instructions + project paths
    .claude/settings.local.json      # CLI-specific config (generated per LLM)
    .mcp.json                        # CLI-specific MCP config (generated per LLM)
    skills/                          # canned workflow files
    projects/                        # local clones, owned by this chat
      grove/                         # clone from bare/ or local path
      other-repo/

  project-setup/{name}/
    files/                           # files copied into every new clone
      .env
      config/user.json

  skills/                            # global skill templates (copied into new chats)
```

### Delete chat = `rm -rf chats/{id}/`

All clones gone. No worktree pruning, no symlink cleanup. Just a directory delete.

### Bare clone cache

`bare/` holds bare clones of remote repos. Shared across chats. Fetched before creating new clones. Persists indefinitely (or pruned on demand).

## Local Clones (not worktrees)

Every project a chat works on gets a **local clone** under `chats/{id}/projects/`.

```bash
# From a remote URL (via bare cache)
git clone --local bare/grove.git chats/{id}/projects/grove
git -C chats/{id}/projects/grove remote set-url origin <github-url>

# From a local path
git clone --local ~/Projects/grove chats/{id}/projects/grove
git -C chats/{id}/projects/grove remote set-url origin <user-remote-url>
```

### Why clones, not worktrees

- **No branch checkout conflicts** — two chats can have the same branch checked out
- **Full isolation** — each chat has an independent copy
- **Simple cleanup** — `rm -rf`, no `git worktree prune`
- **`--local` flag** — uses hardlinks for objects, minimal disk overhead

### Push target

After cloning, `origin` is set to the real remote URL (GitHub, etc.), not the bare cache or local source. `git push` goes directly to the remote.

For local-only projects (no remote), `origin` points to the user's local copy. Edge case — acceptable.

## AGENTS.md

The universal interface. Every LLM reads markdown. No --add-dir, no Claude-specific flags.

```markdown
# Parlour

You are running inside Parlour, a desktop app for orchestrating parallel AI agents.

## MCP Tools
...

## Projects

Your working copy of `grove` is at `./projects/grove` (branch: main).
Your working copy of `api-server` is at `./projects/api-server` (branch: main).

cd into a project directory to work on it. Read its CLAUDE.md or AGENTS.md for project-specific instructions.
```

Updated when `open_dir` is called mid-session (for resume scenarios). The LLM gets the path from the tool response immediately.

## Multi-CLI Configuration

Parlour supports multiple LLM CLIs. The MCP server is Parlour's HTTP endpoint — universal across all CLIs. At chat creation, Parlour generates CLI-specific config files.

### The problem

`.claude/settings.local.json` and `.mcp.json` are Claude Code-specific. Other CLIs have their own formats for the same concepts: MCP server connection, permissions, project instructions.

### The solution

Parlour generates the right files based on the chat's LLM. The MCP server schema is nearly identical across CLIs — all use `{ command, args, env }` for stdio or `{ url }` for HTTP. Only the file path and wrapper format differ.

### Config matrix

| CLI | MCP Config | Instructions | Permissions |
|---|---|---|---|
| Claude Code | `.mcp.json` | `CLAUDE.md` | `.claude/settings.local.json` |
| Gemini CLI | `.gemini/settings.json` | `GEMINI.md` | `trust` per-server in settings |
| Codex CLI | `.codex/config.toml` | `AGENTS.md` | `approval_policy` in config |
| OpenCode | `opencode.json` | `AGENTS.md` (native) | `permission` in config |
| Cursor | `.cursor/mcp.json` | `.cursor/rules/*.mdc` | — |
| Cline | `.cline/mcp_settings.json` | `.clinerules/*.md` | `alwaysAllow` per-server |
| Windsurf | `.codeium/windsurf/mcp_config.json` | — | — |
| Custom | `{name}.mcp.json` | `AGENTS.md` | — |

### What Parlour generates per chat

AGENTS.md is always the canonical file. CLI-specific instruction files are symlinks to it. MCP config is generated from a single source — Parlour's MCP endpoint info — into the format each CLI expects.

For a Claude chat:
```
chats/{id}/
  AGENTS.md
  CLAUDE.md → symlink to AGENTS.md
  .mcp.json
  .claude/settings.local.json
```

For a Gemini chat:
```
chats/{id}/
  AGENTS.md
  GEMINI.md → symlink to AGENTS.md
  .gemini/settings.json        # mcpServers + trust config
```

For a Codex chat:
```
chats/{id}/
  AGENTS.md
  .codex/config.toml           # [mcp] section
```

For an OpenCode chat:
```
chats/{id}/
  AGENTS.md                    # OpenCode reads AGENTS.md natively
  opencode.json                # mcp + permission config
```

For a custom CLI:
```
chats/{id}/
  AGENTS.md
  {name}.mcp.json              # user-defined MCP config template
```

### Custom LLM CLIs

Users can register any CLI that supports MCP:

```json
{
  "customLlms": {
    "my-agent": {
      "command": "my-agent",
      "args": ["--config", "."],
      "instructionsFile": "AGENTS.md",
      "mcpConfig": {
        "file": "my-agent.json",
        "template": {
          "servers": {
            "parlour": {
              "url": "{{parlour_mcp_url}}"
            }
          }
        }
      }
    }
  }
}
```

Parlour substitutes `{{parlour_mcp_url}}` at chat creation. The `template` is the MCP config shape the CLI expects — Parlour writes it with the real endpoint. `instructionsFile` tells Parlour what to symlink AGENTS.md to (or just use AGENTS.md directly if the CLI reads it).

This makes Parlour forward-compatible with any future LLM CLI without code changes.

### Parlour as the MCP server

Since Parlour IS the HTTP MCP server, every CLI connects to the same endpoint. The config files just point to `http://localhost:{port}?caller={chatId}`. Permissions and tool availability are controlled server-side by Parlour, not by CLI-specific permission files.

CLI permission files (`.claude/settings.local.json`, Gemini's `trust`, etc.) are set to auto-approve Parlour's MCP tools. The real access control lives in Parlour.

### Global configuration

```
~/.parlour/
  config.json                  # global Parlour settings (+ customLlms, globalMcpServers)
  llm-defaults/                # per-CLI config templates
    claude/
      settings.local.json
    gemini/
      settings.json
    codex/
      config.toml
    opencode/
      opencode.json
```

Users configure LLM-specific defaults once in `llm-defaults/`. Parlour copies + merges these into each new chat dir. Users who only use Claude never touch this — sensible defaults ship out of the box.

### Settings UI

Settings panel gains an **LLM Defaults** section:

```
┌─ Settings ──────────────────────────────────────┐
│                                                  │
│  General                                         │
│    Default LLM: [Claude Code ▾]                  │
│                                                  │
│  LLM Defaults                                    │
│    Claude Code                                   │
│      Permissions: [Edit template...]             │
│      Auto-approve MCP tools: [✓]                 │
│    Gemini CLI                                    │
│      Trust MCP server: [✓]                       │
│    Codex CLI                                     │
│      Approval policy: [auto-edit ▾]              │
│    OpenCode                                      │
│      Permissions: [Edit template...]             │
│                                                  │
│  Custom LLM CLIs                                 │
│    [+ Add custom CLI...]                         │
│                                                  │
│  Parlour MCP Server                              │
│    Port: [auto]                                  │
│    Tool access: [All tools ▾]                    │
│                                                  │
└──────────────────────────────────────────────────┘
```

Only show CLIs that are installed (detect via `which claude`, `which gemini`, `which codex`, `which opencode`). Custom CLIs always shown if configured.

## Per-Project Setup

Projects often need gitignored files (`.env`, config files) to function. Parlour handles this automatically via learned setup configs.

### Storage

```
~/.parlour/project-setup/{name}/
  files/
    .env
    config/user.json
```

After every clone, files from `project-setup/{name}/files/` are copied into the clone root.

### How setup configs are created

The LLM learns them. Flow:

1. First clone of a project — `.env` is missing, things break
2. User tells the LLM where to find it
3. LLM copies the file, gets things working
4. LLM calls `save_project_setup` MCP tool to persist the file for future clones
5. Every future clone of that project gets the files automatically

Users never touch `~/.parlour/project-setup/` directly.

## MCP Tools (10 total)

### Projects

- **open_dir** — Open a project (path or URL), create a local clone under this chat's `projects/`. Optionally specify branch and base branch.
  ```
  open_dir({ path_or_url, branch?, base? })
  → { name, path, branch }
  ```
  - `branch` only → checkout existing branch
  - `branch` + `base` → create new branch from base
  - Neither → default branch
  - Handles both git repos and non-git directories (non-git dirs are symlinked)
  - Runs project-setup if configured
  - Updates AGENTS.md with the new project path

- **list_projects** — List projects available to this chat. Scans `projects/` directory, runs `git branch --show-current` for each.
  ```
  → [{ name, path, branch }]
  ```

- **save_project_setup** — Save files from the current clone for future clones of this project.
  ```
  save_project_setup({ project, files: [".env", "config/user.json"] })
  ```

### Dispatch & Orchestration

- **dispatch** — Spawn a sub-agent chat with a prompt. Optional `project` creates a clone under the child chat.
  ```
  dispatch({ prompt, project?, branch?, llm? })
  → { chatId, sessionId }
  ```

- **get_status** — Check status of a dispatched sub-agent.
  ```
  get_status({ session_id })
  → { status, output }
  ```

- **list_children** — List child chats of a given chat.
- **report_to_parent** — Send a message to the parent chat.
- **get_parent_output** — Read the parent chat's terminal output.

### Scheduling

- **schedule_chat** — Schedule a recurring or one-time chat.
  ```
  schedule_chat({ prompt, name?, cron?, at?, project?, llm? })
  ```

- **list_schedules** — List all scheduled chats.
- **cancel_schedule** — Delete a scheduled chat.
- **run_schedule** — Trigger an immediate run.

## What Gets Removed

### Types
- `AttachInfo`
- `PreLink`
- `LinkRecord` — replaced by filesystem scan of `projects/`

### ChatRegistry methods
- `attachRepoToChat` — the PTY-killing method, gone entirely
- `processAttach` — replaced by clone logic in `open_dir`

### MCP tools (3 removed)
- `attach_directory` — gone
- `create_worktree` — absorbed into `open_dir`
- `list_links` — replaced by `list_projects` (filesystem scan)

### UI
- Repo picker dialog
- Branch selector in attach flow
- "Attach" button on chats
- "Detach" context menu
- All attach-related IPC channels (`CHAT_ATTACH_WORKTREE`, `CHAT_REGISTRY_ATTACH_REPO`)

### Filesystem
- `~/.parlour/worktrees/` — gone (clones live under chat dirs)
- `chats/{id}/links/` — gone (replaced by `projects/`)
- All symlink creation/management

### Code
- `--add-dir` CLI flag usage
- `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` env var
- `GitService.createWorktreeAt` / `createWorktreeFromBareAt`
- Worktree cleanup logic

### Automations
- `dirs` field on schedule config
- Directory inheritance from calling chat
- `preLinks` parameter on chat creation

## Project Context Display

Project/branch/PR info is **derived** from the filesystem, not stored in state. Same data rendered in three places.

### Data source

Scan `chats/{id}/projects/` on a timer:
- **Project name**: directory name
- **Branch**: `git branch --show-current`
- **PR status**: `gh pr list --head {branch}` (cached via GithubService)

Read-only display. No management UI.

### Sidebar

Compact metadata below each chat name:

```
Fix auth bug
  grove · feature-auth · PR #42

Research caching strategies
  (no project)

Update deps
  grove · bump-deps
  api-server · bump-deps
```

### Header bar

When viewing a chat, the header bar shows the full project context:

```
┌─────────────────────────────────────────────────────┐
│ Fix auth bug          grove · feature-auth · PR #42 │
└─────────────────────────────────────────────────────┘
```

For multi-project chats, show all projects. For no-project chats, header just shows the chat name.

### Chat tab (if space allows)

Abbreviated project info in the tab itself — project name and/or branch. Truncated if needed.

## Chat Lifecycle (revised)

### Create
1. Create `chats/{id}/` with AGENTS.md, .claude/, .mcp.json
2. Spawn PTY with cwd = chat dir
3. LLM reads AGENTS.md, discovers MCP tools

### Open a project (UI or MCP)
1. If URL: bare-clone to `bare/` if not cached, fetch if cached
2. `git clone --local` into `chats/{id}/projects/{name}`
3. Set origin to real remote URL
4. Run project-setup (copy files) if configured
5. Update AGENTS.md with project path
6. Return path to LLM — LLM cds there

### Resume
1. Chat dir persists with projects/ intact
2. Re-spawn PTY with cwd = chat dir
3. LLM reads AGENTS.md, sees project paths, continues

### Delete
1. `rm -rf chats/{id}/` — everything gone
2. No worktree pruning needed

## Automations (simplified)

Automations (scheduled chats) become simpler — no `dirs` array, no inherited folder attachments.

### Before

```typescript
scheduler.create({
  name, prompt, trigger, repo, dirs, llmCommand
  //                            ^^^^ inherited links from calling chat
})
```

The `dirs` field stored symlink paths from the calling chat's `links/` directory, carried forward into the scheduled chat. Brittle — links could go stale, paths could change.

### After

```typescript
scheduler.create({
  name, prompt, trigger, project, llmCommand
})
```

- `project` (optional) — project path or name. Parlour clones it into the scheduled chat's `projects/` at execution time.
- No `dirs`. If the prompt needs multiple projects, the prompt itself includes `open_dir` calls — the LLM handles it.
- Each run gets a fresh clone. No stale state from previous runs.

### Schedule-to-chat relationship

Schedules are standalone — they live in the Automations panel, not inside a chat. But they have a **created-by** lineage and their runs produce chats.

```
Schedule "dep-check"
  created by: chat a1b2c3 (or manually in Automations panel)
  project: grove
  cron: 0 9 * * *
  runs:
    → chat x1 (Feb 14, success)
    → chat x2 (Feb 15, success)
    → chat x3 (Feb 16, failed)
```

**Where schedules appear:**

1. **Automations panel** — primary home. List of all schedules with their runs.
2. **Chat that created it** — if a schedule was created via MCP (`schedule_chat`), the creating chat's header/sidebar shows a badge: `⏱ 1 schedule`. Clicking navigates to Automations.
3. **Schedule runs are chats** — each run creates a chat visible in the sidebar (grouped under the schedule name if the Workspaces view is active, or in the main chat list with a schedule indicator).

**Not stored:** The schedule doesn't "belong to" a chat. The `created_by` is metadata for tracing, not ownership. Deleting the creating chat doesn't delete the schedule.

### What gets removed from TaskScheduler

- `dirs` field on schedule config
- Directory inheritance logic (reading symlinks from calling chat)
- `preLinks` parameter on chat creation from schedules

## Skills Directory

`chats/{id}/skills/` contains canned workflow files shipped by Parlour:
- `pr-review.md`
- `code-audit.md`
- etc.

AGENTS.md references them. LLM reads the relevant skill file when performing that workflow.

## Non-Git Directories

`open_dir` with a non-git path → symlink into `projects/`. No cloning needed. Appears in sidebar scan. Cleaned up with chat deletion.

## Workflows

Every workflow uses 3 primitives: `open_dir`, `dispatch`, `schedule_chat`.

### 1. Hotfix a release

User: "Fix the auth bug on the deploy branch, create a PR back to main"

```
LLM calls: open_dir({ path_or_url: "~/Projects/grove", branch: "hotfix-auth", base: "deploy" })
  → clones into projects/grove, new branch hotfix-auth from deploy
LLM: cd projects/grove, fix, commit, push
LLM: gh pr create --base deploy
```

Sidebar: `grove · hotfix-auth · PR #53`

### 2. Feature work across multiple repos

User: "Add the new auth flow — needs changes in both grove and api-server"

```
LLM calls: open_dir({ path_or_url: "~/Projects/grove", branch: "feature-auth" })
LLM calls: open_dir({ path_or_url: "~/Projects/api-server", branch: "feature-auth" })
  → projects/grove/ and projects/api-server/ both live in one chat
```

LLM switches between them or dispatches children — one per repo.

### 3. Three directions on same feature

User: "Try three approaches for the caching layer"

```
Parent dispatches:
  dispatch({ prompt: "Try Redis", project: "grove", branch: "cache-redis" })
  dispatch({ prompt: "Try in-memory", project: "grove", branch: "cache-memory" })
  dispatch({ prompt: "Try SQLite", project: "grove", branch: "cache-sqlite" })
```

Each child gets its own clone — three branches, zero conflicts. This is why we use clones, not worktrees.

### 4. Research + non-git directory

User: "Research caching strategies, reference my notes in ~/Obsidian/engineering"

```
LLM calls: open_dir({ path_or_url: "~/Obsidian/engineering" })
  → non-git dir, symlinked into projects/engineering
```

Later: "ok now implement it in grove"

```
LLM calls: open_dir({ path_or_url: "~/Projects/grove", branch: "caching" })
```

Sidebar: `engineering (local) · grove · caching`

### 5. Chat then schedule

User has a conversation, then says "run this check every morning"

```
LLM calls: schedule_chat({
  prompt: "Check grove for dependency updates...",
  cron: "0 9 * * *",
  project: "grove"
})
```

Each run gets a fresh clone. No stale state from the parent.

### 6. One-off and recurring schedules

```
# One-off
schedule_chat({ prompt: "Run full test suite...", at: "2026-02-15T02:00:00", project: "grove" })

# Recurring
schedule_chat({ prompt: "Check for stale PRs...", cron: "0 10 * * 1-5", project: "grove" })

# No project (pure research)
schedule_chat({ prompt: "Summarize HN front page...", cron: "0 8 * * *" })
```

### Workflow summary

| Workflow | open_dir | dispatch | schedule | Clones |
|---|---|---|---|---|
| Hotfix | 1 (branch+base) | — | — | 1 |
| Multi-repo | N | optional | — | N |
| 3 directions | — | 3 | — | 3 (children) |
| Research + local | 1–2 | — | — | 0–1 + symlink |
| Chat → schedule | — | — | 1 | 1 per run |
| Scheduled prompts | — | — | 1 | 0–1 per run |

## Global Configuration (above chat level)

Some things live above individual chats — user-level settings that affect all chats.

### Filesystem

```
~/.parlour/
  config.json                  # Parlour app settings
  llm-defaults/                # per-CLI config templates
    claude/
      settings.local.json
    gemini/
      settings.json
    codex/
      config.toml
  bare/                        # shared clone cache
  project-setup/               # learned setup files per project
  skills/                      # global skill templates (copied into new chats)
  chats/                       # all chats
```

### What lives at global level

| Concern | Location | Scope |
|---|---|---|
| Default LLM | `config.json` | All new chats |
| LLM permissions templates | `llm-defaults/{cli}/` | Copied into each new chat |
| Global MCP servers | `config.json → globalMcpServers` | Merged into every chat's MCP config |
| Bare clone cache | `bare/` | Shared across all chats |
| Project setup files | `project-setup/{name}/` | Applied to clones of that project |
| Skill templates | `skills/` | Copied into new chat dirs |
| Keybindings | `config.json` | App-wide |
| Theme/appearance | `config.json` | App-wide |

### Global MCP servers

Users may have MCP servers they want available in every chat (GitHub, Sentry, Slack, etc.). These live in `config.json`:

```json
{
  "globalMcpServers": {
    "github": {
      "type": "stdio",
      "command": "gh-mcp-server",
      "args": []
    }
  }
}
```

At chat creation, Parlour merges global MCP servers into the chat's CLI-specific MCP config alongside Parlour's own MCP endpoint. Per-chat overrides can disable specific global servers.

### User-installed CLI tools

Things like `gh`, `claude`, `gemini`, `codex` are system-level — installed by the user, not managed by Parlour. Parlour detects what's available (`which` checks) and adapts:

- **LLM selector**: only shows installed CLIs
- **MCP config**: only generates configs for the selected CLI
- **Skills**: can reference CLI-specific capabilities in skill files

Parlour doesn't install or manage these tools. It adapts to what's present.

### Settings UI integration

The Settings panel covers global concerns:

```
┌─ Settings ──────────────────────────────────────┐
│                                                  │
│  General                                         │
│    Default LLM: [Claude Code ▾]                  │
│    Theme: [Dark ▾]                               │
│                                                  │
│  LLM Defaults                                    │
│    Claude Code     [Edit permissions...]          │
│    Gemini CLI      [Edit settings...]             │
│    Codex CLI       [Edit config...]               │
│                                                  │
│  Global MCP Servers                              │
│    github          stdio · gh-mcp-server          │
│    sentry          http · https://...             │
│    [+ Add server]                                │
│                                                  │
│  Keybindings       [Customize...]                │
│                                                  │
└──────────────────────────────────────────────────┘
```

Global MCP servers show up in every chat's MCP config. LLM defaults are templates copied into new chats. Per-chat overrides are possible but rare.

## Diagrams

See [diagrams.md](./diagrams.md) for ASCII architecture diagrams:

1. Process architecture — how main process services connect
2. Clone flow — open_dir decision tree (URL vs local vs non-git)
3. Chat lifecycle — create → run → resume/delete state machine
4. State flow — filesystem → main process scanning → IPC push → renderer
5. Config generation — per-CLI config file generation
6. Dispatch & scheduling — child chats and scheduled runs
7. Before → after — what gets removed
8. Full filesystem example — two active chats

## Design Principles

1. **AGENTS.md is the universal interface** — works with any LLM CLI
2. **Filesystem is the state** — derive everything from disk, don't store redundant records
3. **Chat dir owns everything** — delete it, everything's gone
4. **LLMs handle branching** — no branch selection UI, the LLM creates/checks out branches naturally
5. **Projects are implicit** — not a top-level UI concept, just something that appears in conversation
