# Simplified Directory Model — Diagrams

## 1. Process Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Main Process                                                       │
│                                                                     │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│  │ ChatRegistry │────▶│  PtyManager  │────▶│  node-pty    │        │
│  │              │     │              │     │  (per chat)  │        │
│  │  - create    │     │  - spawn     │     └──────────────┘        │
│  │  - resume    │     │  - buffer    │                              │
│  │  - delete    │     │  - title     │                              │
│  │  - scan      │     └──────────────┘                              │
│  │              │                                                   │
│  │              │     ┌──────────────┐     ┌──────────────┐        │
│  │              │────▶│  GitService  │────▶│  git CLI     │        │
│  │              │     │              │     └──────────────┘        │
│  │              │     │  - cloneLocal│                              │
│  │              │     │  - fetch     │                              │
│  │              │     │  - branch    │                              │
│  │              │     └──────────────┘                              │
│  │              │                                                   │
│  │              │     ┌──────────────┐                              │
│  │              │────▶│ parlour-dirs │                              │
│  │              │     │              │                              │
│  │              │     │  - chatDir   │                              │
│  │              │     │  - agentsMd  │                              │
│  │              │     │  - cliConfig │                              │
│  │              │     └──────────────┘                              │
│  └──────┬───────┘                                                   │
│         │                                                           │
│         │ pushToRenderer()                                          │
│         ▼                                                           │
│  ┌──────────────┐                          ┌──────────────┐        │
│  │     IPC      │◀─────────────────────────│  MCP Server  │        │
│  │              │                          │  (HTTP)      │        │
│  │  CHAT_STATE  │     ┌──────────────┐     │              │        │
│  │  _CHANGED    │     │TaskScheduler │────▶│  - open_dir  │        │
│  └──────┬───────┘     │              │     │  - dispatch  │        │
│         │             │  - cron jobs │     │  - schedule  │        │
│         │             │  - one-time  │     │  - ...       │        │
│         │             └──────────────┘     └──────┬───────┘        │
│         │                                         │                 │
└─────────┼─────────────────────────────────────────┼─────────────────┘
          │                                         │
          ▼                                         ▼
┌──────────────────┐                    ┌──────────────────┐
│    Renderer      │                    │   LLM CLI        │
│                  │                    │   (claude, etc)  │
│  Zustand store   │                    │                  │
│  ├─ chats[]      │                    │  reads AGENTS.md │
│  ├─ settings     │                    │  calls MCP tools │
│  └─ navigation   │                    └──────────────────┘
└──────────────────┘
```

## 2. Clone Flow (open_dir)

```
open_dir({ path_or_url, branch?, base? })
                │
                ▼
        ┌───────────────┐
        │  Is it a URL?  │
        └───┬───────┬───┘
          yes       no
            │        │
            ▼        ▼
  ┌──────────────┐  ┌──────────────────┐
  │ bare/ cached? │  │  Is it a git repo? │
  └──┬────────┬──┘  └──┬────────────┬──┘
    yes       no      yes            no
     │         │       │              │
     ▼         ▼       ▼              ▼
  ┌──────┐ ┌──────┐ ┌──────────┐  ┌──────────┐
  │ fetch │ │clone │ │clone     │  │ symlink  │
  │ --all │ │--bare│ │--local   │  │ into     │
  │--prune│ │to   │ │from path │  │projects/ │
  └──┬───┘ │bare/ │ └────┬─────┘  └────┬─────┘
     │     └──┬───┘      │             │
     │        │          │             │
     ▼        ▼          │             │
  ┌──────────────┐       │             │
  │ clone --local│       │             │
  │ from bare/   │       │             │
  │ to projects/ │       │             │
  └──────┬───────┘       │             │
         │               │             │
         ▼               ▼             │
  ┌──────────────────────────┐         │
  │ set origin → real remote │         │
  └──────────┬───────────────┘         │
             │                         │
             ▼                         │
  ┌────────────────────┐               │
  │  branch specified? │               │
  └──┬──────────────┬──┘               │
    yes             no                 │
     │               │                 │
     ▼               │                 │
  ┌──────────────┐   │                 │
  │ base also?   │   │                 │
  └──┬────────┬──┘   │                 │
    yes       no     │                 │
     │         │     │                 │
     ▼         ▼     │                 │
  checkout  checkout │                 │
  -b branch  branch  │                 │
  from base          │                 │
     │         │     │                 │
     └────┬────┘     │                 │
          ▼          ▼                 ▼
  ┌──────────────────────────────────────┐
  │  apply project-setup (if configured) │
  └──────────────────┬───────────────────┘
                     │
                     ▼
  ┌──────────────────────────────────────┐
  │  update AGENTS.md with project path  │
  └──────────────────┬───────────────────┘
                     │
                     ▼
           return { name, path, branch }
```

## 3. Chat Lifecycle

```
                 ┌─────────┐
                 │  START   │
                 └────┬────┘
                      │
                      ▼
         ┌────────────────────────┐
         │  createChatDir(id)     │
         │  ├─ mkdir chats/{id}/  │
         │  ├─ mkdir projects/    │
         │  ├─ mkdir skills/      │
         │  ├─ copy skill files   │
         │  ├─ detect CLI type    │
         │  ├─ generate configs   │
         │  │  (mcp, permissions) │
         │  └─ write AGENTS.md    │
         └────────────┬──────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │  project specified?    │
         └───┬────────────────┬──┘
           yes                no
            │                  │
            ▼                  │
         cloneProject()        │
            │                  │
            ▼                  ▼
         ┌────────────────────────┐
         │  spawn PTY             │
         │  cwd = chats/{id}/     │
         │  cmd = llmCommand      │
         │  (no --add-dir)        │
         └────────────┬──────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │       RUNNING          │
         │                        │
         │  LLM reads AGENTS.md   │◀──── open_dir() adds projects
         │  LLM calls MCP tools   │      mid-session, updates
         │  LLM works in projects │      AGENTS.md
         │                        │
         └───┬────────────┬──────┘
             │            │
          exit          resume
             │            │
             ▼            ▼
    ┌────────────┐  ┌────────────────────┐
    │  STOPPED   │  │  re-spawn PTY      │
    │            │  │  --resume {session} │
    │  dir stays │  │  or --continue     │
    │  on disk   │  │                    │
    └────┬───────┘  │  projects/ intact  │
         │         │  AGENTS.md intact   │
         │         └────────┬───────────┘
         │                  │
         │                  ▼
         │              RUNNING (loops back)
         │
      delete
         │
         ▼
    ┌────────────────┐
    │ rm -rf          │
    │ chats/{id}/     │
    │                 │
    │ done. no prune, │
    │ no cleanup.     │
    └────────────────┘
```

## 4. State Flow: Filesystem → UI

```
 Filesystem (source of truth)              Main Process                 Renderer
 ─────────────────────────                 ────────────                 ────────

 chats/{id}/projects/
   grove/                    ──scan──▶  ProjectContext[]          ──push──▶  Zustand
     .git/                              ├─ name: "grove"                    store
       HEAD → feature-auth              ├─ path: "projects/grove"           │
                                        ├─ branch: "feature-auth"           ▼
                                        ├─ isGitRepo: true             ┌─────────┐
                             ──gh pr──▶ └─ pr: { num: 42, ... }       │ Sidebar  │
                                                                       │          │
   api-server/               ──scan──▶  ProjectContext[]               │ grove    │
     .git/                              ├─ name: "api-server"          │  feature │
       HEAD → main                      ├─ branch: "main"             │  -auth   │
                                        └─ pr: null                   │  PR #42  │
                                                                       │          │
                                                                       │ api-     │
 Timer (every N seconds)                                               │ server   │
 or after open_dir()          ──triggers scan──▶                       │  main    │
                                                                       └─────────┘
                                                                           │
                              ChatRecord {                                 ▼
                                id, name, status,                    ┌──────────┐
                                projects: ProjectContext[]           │ HeaderBar│
                              }                                      │          │
                                        │                            │ grove ·  │
                                        │ CHAT_STATE_CHANGED         │ feature- │
                                        │ (IPC push)                 │ auth ·   │
                                        ▼                            │ PR #42   │
                                   all windows                       └──────────┘
```

## 5. Config Generation Flow

```
createChat(opts)
      │
      ▼
detectCliType(opts.llmCommand)
      │
      ├── "claude"  ──────────────────────────────┐
      ├── "gemini"  ──────────────────────┐       │
      ├── "codex"   ────────────┐         │       │
      ├── "opencode" ─────┐     │         │       │
      └── custom ──┐      │     │         │       │
                   │      │     │         │       │
                   ▼      ▼     ▼         ▼       ▼
              ┌──────────────────────────────────────────┐
              │          For each CLI, generate:          │
              │                                          │
              │  1. AGENTS.md (canonical, always)         │
              │                                          │
              │  2. Instruction file symlink:             │
              │     claude  → CLAUDE.md → AGENTS.md      │
              │     gemini  → GEMINI.md → AGENTS.md      │
              │     codex   → (reads AGENTS.md)          │
              │     opencode→ (reads AGENTS.md natively)  │
              │     custom  → {name}.md → AGENTS.md      │
              │                                          │
              │  3. MCP config:                           │
              │     claude  → .mcp.json                   │
              │     gemini  → .gemini/settings.json       │
              │     codex   → .codex/config.toml          │
              │     opencode→ opencode.json               │
              │     custom  → {template} w/ substitution  │
              │                                          │
              │  4. Permission config:                    │
              │     claude  → .claude/settings.local.json │
              │     gemini  → trust flag in settings      │
              │     codex   → approval_policy in config   │
              │     opencode→ permission in config        │
              └──────────────┬───────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────────────┐
              │  Merge global MCP servers from        │
              │  config.json → globalMcpServers       │
              │  into the CLI-specific config file    │
              └──────────────┬───────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────────────┐
              │  Copy LLM defaults from               │
              │  llm-defaults/{cli}/ into chat dir    │
              │  (merge, don't overwrite generated)   │
              └──────────────────────────────────────┘
```

## 6. Dispatch & Scheduling

```
                        Parent Chat
                    ┌──────────────────┐
                    │  "Try 3 caching  │
                    │   approaches"    │
                    └────────┬─────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
dispatch(prompt,      dispatch(prompt,      dispatch(prompt,
  project:"grove",     project:"grove",     project:"grove",
  branch:"redis")      branch:"memory")     branch:"sqlite")
         │                   │                   │
         ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Child Chat  │    │  Child Chat  │    │  Child Chat  │
│              │    │              │    │              │
│  chats/c1/   │    │  chats/c2/   │    │  chats/c3/   │
│  projects/   │    │  projects/   │    │  projects/   │
│    grove/    │    │    grove/    │    │    grove/    │
│    (redis    │    │    (memory   │    │    (sqlite   │
│     branch)  │    │     branch)  │    │     branch)  │
│              │    │              │    │              │
│  own PTY     │    │  own PTY     │    │  own PTY     │
│  own clone   │    │  own clone   │    │  own clone   │
│  own AGENTS  │    │  own AGENTS  │    │  own AGENTS  │
└──────────────┘    └──────────────┘    └──────────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                   report_to_parent()
                             │
                             ▼
                     Parent reviews,
                     picks winner


─────────────────────────────────────────────────────────

                     schedule_chat()
                             │
                             ▼
              ┌──────────────────────────┐
              │  Schedule "dep-check"     │
              │  cron: 0 9 * * *         │
              │  project: "grove"        │
              │  created_by: chat-a1b2   │
              └──────────┬───────────────┘
                         │
            ┌────────────┼────────────┐
            │            │            │
       9am Feb14    9am Feb15    9am Feb16
            │            │            │
            ▼            ▼            ▼
       ┌────────┐   ┌────────┐   ┌────────┐
       │chat x1 │   │chat x2 │   │chat x3 │
       │fresh   │   │fresh   │   │fresh   │
       │clone   │   │clone   │   │clone   │
       │of grove│   │of grove│   │of grove│
       └────────┘   └────────┘   └────────┘
```

## 7. Before → After

```
 BEFORE (current)                          AFTER (simplified)
 ────────────────                          ──────────────────

 ~/.parlour/                               ~/.parlour/
   worktrees/          ← REMOVED             config.json
   chats/{id}/                               bare/
     links/            ← REMOVED             llm-defaults/
       grove → symlink ← REMOVED             project-setup/
     .claude/                                skills/
     .mcp.json                               chats/{id}/
                                               AGENTS.md
                                               projects/
 Types:                                          grove/    ← real clone
   LinkRecord          ← REMOVED
   AttachInfo          ← REMOVED           Types:
   PreLink             ← REMOVED             ProjectContext  ← filesystem scan
   RepoRecord          ← REMOVED

 Methods:                                  Methods:
   attachRepoToChat    ← REMOVED             cloneProject    ← new
   processAttach       ← REMOVED             scanProjects    ← new
   addLink             ← REMOVED
   removeLink          ← REMOVED
   getChatLinks        ← REMOVED

 MCP tools (13):                           MCP tools (10-12):
   open_repo           ← REMOVED             open_dir        ← new
   create_worktree     ← REMOVED             list_projects   ← new
   attach_directory    ← REMOVED             save_project_setup ← new
   list_links          ← REMOVED             dispatch
   list_repos          ← REMOVED             get_status
   dispatch                                  list_children
   get_status                                report_to_parent
   schedule_chat                             get_parent_output
   list_schedules                            schedule_chat
   cancel_schedule                           list_schedules
   run_schedule                              cancel_schedule
   list_children                             run_schedule
   report_to_parent
   get_parent_output
   get_chat_status

 PTY spawn:                                PTY spawn:
   --add-dir links/grove ← REMOVED          just cwd = chat dir
   CLAUDE_CODE_ADDITIONAL                    LLM reads AGENTS.md
     _DIRECTORIES_CLAUDE_MD ← REMOVED       LLM cds into projects/

 UI:                                       UI:
   AttachDialog         ← REMOVED            project context in sidebar
   RepoForm             ← REMOVED            project context in header
   "Attach" button      ← REMOVED            no attach anything
   Branch selector      ← REMOVED
   Detach context menu  ← REMOVED

 IPC channels (6 removed):
   CHAT_LINK             ← REMOVED
   CHAT_UNLINK           ← REMOVED
   CHAT_ATTACH_WORKTREE  ← REMOVED
   CHAT_DETACH_WORKTREE  ← REMOVED
   CHAT_REGISTRY_ATTACH_REPO ← REMOVED
   SCHEDULE_ADD_DIR      ← REMOVED
```

## 8. Full Filesystem Example (2 chats active)

```
~/.parlour/
├── config.json
│   {
│     "defaultLlm": "claude",
│     "globalMcpServers": {
│       "github": { "type": "stdio", "command": "gh-mcp-server" }
│     },
│     "customLlms": {}
│   }
│
├── bare/
│   ├── grove.git/              ← bare clone, shared
│   └── api-server.git/         ← bare clone, shared
│
├── llm-defaults/
│   ├── claude/
│   │   └── settings.local.json
│   └── gemini/
│       └── settings.json
│
├── project-setup/
│   └── grove/
│       └── files/
│           └── .env            ← learned from first clone
│
├── skills/
│   ├── pr-review.md
│   └── code-audit.md
│
└── chats/
    ├── a1b2c3/                 ← "Fix auth bug" (Claude)
    │   ├── AGENTS.md
    │   ├── CLAUDE.md → AGENTS.md
    │   ├── .mcp.json
    │   ├── .claude/
    │   │   └── settings.local.json
    │   ├── skills/
    │   │   ├── pr-review.md
    │   │   └── code-audit.md
    │   └── projects/
    │       └── grove/          ← clone, branch: feature-auth
    │           ├── .env        ← from project-setup
    │           ├── src/
    │           └── ...
    │
    └── d4e5f6/                 ← "Research caching" (Gemini)
        ├── AGENTS.md
        ├── GEMINI.md → AGENTS.md
        ├── .gemini/
        │   └── settings.json
        ├── skills/
        │   ├── pr-review.md
        │   └── code-audit.md
        └── projects/
            ├── grove/          ← clone, branch: caching
            └── engineering/    ← symlink → ~/Obsidian/engineering
```
