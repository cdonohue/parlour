import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdir, writeFile, readFile, readdir, stat, lstat, cp } from 'node:fs/promises'
import { existsSync } from 'node:fs'

export const PARLOUR_DIR = join(homedir(), '.parlour')
export const BARE_DIR = join(PARLOUR_DIR, 'bare')
export const PROJECT_SETUP_DIR = join(PARLOUR_DIR, 'project-setup')
export const SKILLS_DIR = join(PARLOUR_DIR, 'skills')
export const LLM_DEFAULTS_DIR = join(PARLOUR_DIR, 'llm-defaults')

const DEFAULT_SKILLS: Record<string, string> = {
  'pr-review.md': `# PR Review

Review the current branch's changes against the base branch.

## Steps

1. Run \`git diff $(git merge-base HEAD main)..HEAD\` to see all changes
2. Review each file for:
   - Logic errors or edge cases
   - Missing error handling
   - Security concerns
   - Test coverage gaps
3. Summarize findings with specific line references
4. Suggest concrete improvements
`,
  'code-audit.md': `# Code Audit

Audit the project for quality, security, and maintainability issues.

## Steps

1. Scan the project structure and identify key modules
2. Check for:
   - Hardcoded secrets or credentials
   - SQL injection / XSS / CSRF vulnerabilities
   - Outdated dependencies with known CVEs
   - Dead code and unused exports
   - Missing input validation at system boundaries
3. Report findings ranked by severity (critical → low)
4. Provide actionable fix suggestions
`,
}

export async function ensureGlobalSkills(): Promise<void> {
  await mkdir(SKILLS_DIR, { recursive: true })
  for (const [name, content] of Object.entries(DEFAULT_SKILLS)) {
    const p = join(SKILLS_DIR, name)
    if (!existsSync(p)) {
      await writeFile(p, content, 'utf-8')
    }
  }
}

export async function copySkillsToChat(chatDir: string): Promise<void> {
  const skillsDest = join(chatDir, 'skills')
  await mkdir(skillsDest, { recursive: true })
  if (!existsSync(SKILLS_DIR)) return
  await cp(SKILLS_DIR, skillsDest, { recursive: true, force: false }).catch(() => {})
}

export async function scanSkills(chatDir: string): Promise<string[]> {
  const skillsDir = join(chatDir, 'skills')
  try {
    const entries = await readdir(skillsDir)
    return entries.filter((e) => e.endsWith('.md')).sort()
  } catch {
    return []
  }
}

export interface ProjectInfo {
  name: string
  path: string
  branch?: string
  isGitRepo: boolean
  prInfo?: import('@parlour/api-types').PrInfo
}

export async function createChatDir(chatId: string, parentDirPath?: string): Promise<string> {
  const chatDir = parentDirPath
    ? join(parentDirPath, 'chats', chatId)
    : join(PARLOUR_DIR, 'chats', chatId)
  await mkdir(join(chatDir, 'projects'), { recursive: true })
  return chatDir
}

const PARLOUR_AGENTS_MD = `# Parlour

You are running inside Parlour, a desktop app for orchestrating parallel AI agents.

## parlour CLI

Use the \`parlour\` command to interact with Parlour. Run \`parlour --help\` for full usage.

### Projects

- \`parlour project open <path-or-url>\` — Open a project by local path or git URL. Creates a local clone under \`./projects/\`. Add \`--branch <name>\` and/or \`--base <name>\`.
- \`parlour project list\` — List projects available to this chat with their branches.

### Dispatch & Orchestration

- \`parlour dispatch "<prompt>"\` — Spawn a sub-agent chat. Add \`--project <path>\` for project-scoped work. Add \`--llm <command>\` to use a specific CLI (codex, gemini, opencode, aider).
- \`parlour status [chatId]\` — Check status of a chat (defaults to current).
- \`parlour list-children\` — List child chats.
- \`parlour report "<message>"\` — Send a message to the parent chat.

### Scheduling

- \`parlour schedule "<prompt>" --cron "0 * * * *"\` — Schedule a recurring task.
- \`parlour schedule "<prompt>" --at "2025-01-01T00:00:00"\` — Schedule a one-time task.
- \`parlour schedule list\` — List all scheduled tasks.
- \`parlour schedule cancel <id>\` — Cancel a scheduled task.
- \`parlour schedule run <id>\` — Trigger an immediate run.

## Important Patterns

**Always use \`parlour project open\` when asked to work with a project, check out a branch, or open a repo.** Never \`git clone\` or \`git checkout\` manually — it handles cloning, branching, and project tracking. cd into the returned path to work.

**Read each project's CLAUDE.md or AGENTS.md** for project-specific instructions.

**Dispatch for parallel work.** Each dispatch creates a visible chat with its own terminal and its own project clone.
`

export async function scanProjects(chatDir: string): Promise<ProjectInfo[]> {
  const projectsDir = join(chatDir, 'projects')
  const projects: ProjectInfo[] = []
  try {
    const entries = await readdir(projectsDir)
    for (const name of entries) {
      if (name.startsWith('.')) continue
      const projectPath = join(projectsDir, name)
      const ls = await lstat(projectPath)
      if (!ls.isDirectory() && !ls.isSymbolicLink()) continue

      if (ls.isSymbolicLink()) {
        try { await stat(projectPath) } catch {
          projects.push({ name, path: projectPath, isGitRepo: false })
          continue
        }
      }

      let branch: string | undefined
      let isGitRepo = false
      try {
        const { execFile } = await import('node:child_process')
        const { promisify } = await import('node:util')
        const exec = promisify(execFile)
        const { stdout } = await exec('git', ['branch', '--show-current'], { cwd: projectPath, timeout: 5000 })
        branch = stdout.trim() || undefined
        isGitRepo = true
      } catch {}

      projects.push({ name, path: projectPath, branch, isGitRepo })
    }
  } catch {}
  return projects
}

export async function scanProjectRoots(roots: string[]): Promise<string[]> {
  const repos: string[] = []
  for (const root of roots) {
    const expanded = root.replace(/^~/, homedir())
    try {
      const entries = await readdir(expanded)
      for (const name of entries) {
        if (name.startsWith('.')) continue
        const full = join(expanded, name)
        const s = await stat(full).catch(() => null)
        if (s?.isDirectory()) repos.push(full)
      }
    } catch {}
  }
  return repos
}

export async function writeAgentsMd(
  chatDir: string,
  projects?: ProjectInfo[],
  projectRoots?: string[],
): Promise<void> {
  await mkdir(chatDir, { recursive: true })

  let userContent = ''
  try { userContent = await readFile(join(PARLOUR_DIR, 'AGENTS.md'), 'utf-8') } catch {}

  let content = userContent || PARLOUR_AGENTS_MD

  const scanned = projects ?? await scanProjects(chatDir)

  if (scanned.length > 0) {
    content += '\n## Projects\n\n'
    for (const p of scanned) {
      content += `Your working copy of \`${p.name}\` is at \`${p.path}\`.\n`
    }
    content += '\ncd into a project directory to work on it. Check which branch is active with `git branch --show-current`. Read its CLAUDE.md or AGENTS.md for project-specific instructions.\n'
  }

  if (projectRoots && projectRoots.length > 0) {
    const available = await scanProjectRoots(projectRoots)
    if (available.length > 0) {
      content += '\n## Available Repos\n\n'
      content += 'These local repos can be opened with `parlour project open`:\n\n'
      for (const repo of available) {
        content += `- \`${repo}\`\n`
      }
    }
  }

  const skills = await scanSkills(chatDir)
  if (skills.length > 0) {
    content += '\n## Skills\n\n'
    content += 'Workflow templates are available in `./skills/`. Read the relevant file when performing that workflow:\n\n'
    for (const skill of skills) {
      const name = skill.replace(/\.md$/, '').replace(/[-_]/g, ' ')
      content += `- \`./skills/${skill}\` — ${name}\n`
    }
  }

  await writeFile(join(chatDir, 'AGENTS.md'), content, 'utf-8')
}

export async function getClaudeSessionId(chatDir: string): Promise<string | null> {
  const encoded = chatDir.replace(/[/.]/g, '-')
  const projectDir = join(homedir(), '.claude', 'projects', encoded)
  try {
    const entries = await readdir(projectDir)
    const jsonls = entries.filter((e) => e.endsWith('.jsonl'))
    if (jsonls.length === 0) return null

    let latest: { name: string; mtime: number } | null = null
    for (const f of jsonls) {
      const s = await stat(join(projectDir, f))
      if (!latest || s.mtimeMs > latest.mtime) latest = { name: f, mtime: s.mtimeMs }
    }
    return latest ? latest.name.replace('.jsonl', '') : null
  } catch {
    return null
  }
}
