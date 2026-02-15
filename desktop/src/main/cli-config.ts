import { join } from 'node:path'
import { mkdir, writeFile, readFile, symlink, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { CliType } from './cli-detect'
import type { McpServerConfig } from './config-service'
import { getGlobalMcpServers, getCustomLlms } from './config-service'
import { LLM_DEFAULTS_DIR } from './parlour-dirs'

const DEFAULT_DENY = [
  'Bash(rm -rf *)',
  'Bash(sudo *)',
  'Bash(chmod 777 *)',
  'Bash(mkfs *)',
  'Bash(dd *)',
  'Bash(git push --force *)',
  'Bash(git reset --hard *)',
]

interface ConfigContext {
  chatDir: string
  chatId: string
  mcpPort: number
  cliType: CliType
  llmCommand: string
  globalMcpServers: Record<string, McpServerConfig>
}

function buildMcpServers(
  port: number,
  chatId: string,
  globalServers: Record<string, McpServerConfig>,
): Record<string, unknown> {
  return {
    parlour: { type: 'http', url: `http://localhost:${port}/mcp?caller=${chatId}` },
    ...globalServers,
  }
}

async function linkInstructions(chatDir: string, filename: string): Promise<void> {
  const target = join(chatDir, filename)
  await unlink(target).catch(() => {})
  await symlink('AGENTS.md', target).catch(() => {})
}

async function readDefaults(cliName: string, filename: string): Promise<string | null> {
  const p = join(LLM_DEFAULTS_DIR, cliName, filename)
  if (!existsSync(p)) return null
  try {
    return await readFile(p, 'utf-8')
  } catch {
    return null
  }
}

// ── Claude Code ──

async function configClaude(ctx: ConfigContext): Promise<void> {
  const { chatDir, chatId, mcpPort, globalMcpServers } = ctx
  const mcpServers = buildMcpServers(mcpPort, chatId, globalMcpServers)

  await writeFile(join(chatDir, '.mcp.json'), JSON.stringify({ mcpServers }, null, 2), 'utf-8')

  await mkdir(join(chatDir, '.claude'), { recursive: true })
  let settings: Record<string, unknown> = {
    permissions: { deny: DEFAULT_DENY, defaultMode: 'bypassPermissions' },
  }
  const raw = await readDefaults('claude', 'settings.local.json')
  if (raw) {
    try { settings = { ...settings, ...JSON.parse(raw) } } catch {}
  }
  await writeFile(join(chatDir, '.claude', 'settings.local.json'), JSON.stringify(settings, null, 2), 'utf-8')

  await linkInstructions(chatDir, 'CLAUDE.md')
}

// ── Gemini CLI ──

async function configGemini(ctx: ConfigContext): Promise<void> {
  const { chatDir, chatId, mcpPort, globalMcpServers } = ctx

  await mkdir(join(chatDir, '.gemini'), { recursive: true })
  const mcpServers = buildMcpServers(mcpPort, chatId, globalMcpServers)

  const geminiServers: Record<string, unknown> = {}
  for (const [name, config] of Object.entries(mcpServers)) {
    geminiServers[name] = { ...(config as object), trust: true }
  }

  let settings: Record<string, unknown> = { mcpServers: geminiServers }
  const raw = await readDefaults('gemini', 'settings.json')
  if (raw) {
    try {
      const defaults = JSON.parse(raw)
      settings = { ...defaults, mcpServers: { ...(defaults.mcpServers ?? {}), ...geminiServers } }
    } catch {}
  }

  await writeFile(join(chatDir, '.gemini', 'settings.json'), JSON.stringify(settings, null, 2), 'utf-8')
  await linkInstructions(chatDir, 'GEMINI.md')
}

// ── Codex CLI ──

async function configCodex(ctx: ConfigContext): Promise<void> {
  const { chatDir, chatId, mcpPort, globalMcpServers } = ctx

  await mkdir(join(chatDir, '.codex'), { recursive: true })
  const mcpServers = buildMcpServers(mcpPort, chatId, globalMcpServers)

  let toml = 'approval_policy = "full-auto"\n\n'
  for (const [name, config] of Object.entries(mcpServers)) {
    const c = config as Record<string, unknown>
    toml += `[mcp.${name}]\n`
    if (c.type) toml += `type = "${c.type}"\n`
    if (c.url) toml += `url = "${c.url}"\n`
    if (c.command) toml += `command = "${c.command}"\n`
    if (c.args) toml += `args = [${(c.args as string[]).map((a) => `"${a}"`).join(', ')}]\n`
    toml += '\n'
  }

  const raw = await readDefaults('codex', 'config.toml')
  if (raw) {
    const nonMcp = raw.split('\n').filter((l) => !l.startsWith('[mcp.') && !l.startsWith('approval_policy'))
    if (nonMcp.some((l) => l.trim())) toml += nonMcp.join('\n')
  }

  await writeFile(join(chatDir, '.codex', 'config.toml'), toml, 'utf-8')
}

// ── OpenCode ──

async function configOpenCode(ctx: ConfigContext): Promise<void> {
  const { chatDir, chatId, mcpPort, globalMcpServers } = ctx
  const mcpServers = buildMcpServers(mcpPort, chatId, globalMcpServers)

  let config: Record<string, unknown> = { mcp: mcpServers, permission: 'auto' }
  const raw = await readDefaults('opencode', 'opencode.json')
  if (raw) {
    try {
      const defaults = JSON.parse(raw)
      config = { ...defaults, mcp: { ...(defaults.mcp ?? {}), ...mcpServers } }
    } catch {}
  }

  await writeFile(join(chatDir, 'opencode.json'), JSON.stringify(config, null, 2), 'utf-8')
}

// ── Custom CLI ──

async function configCustom(ctx: ConfigContext): Promise<void> {
  const { chatDir, chatId, mcpPort, llmCommand, globalMcpServers } = ctx
  const customLlms = await getCustomLlms()
  const cmd = llmCommand.trim().split(/\s+/)[0].split('/').pop() ?? llmCommand
  const custom = customLlms[cmd]

  if (!custom?.mcpConfig) {
    await configClaude(ctx)
    return
  }

  const mcpUrl = `http://localhost:${mcpPort}/mcp?caller=${chatId}`
  const rendered = JSON.stringify(custom.mcpConfig.template).replace(/\{\{parlour_mcp_url\}\}/g, mcpUrl)
  const config = JSON.parse(rendered)

  if (globalMcpServers && Object.keys(globalMcpServers).length > 0) {
    for (const key of ['servers', 'mcpServers', 'mcp']) {
      if (config[key] && typeof config[key] === 'object') {
        Object.assign(config[key], globalMcpServers)
        break
      }
    }
  }

  const configPath = join(chatDir, custom.mcpConfig.file)
  await mkdir(join(configPath, '..'), { recursive: true })
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')

  if (custom.instructionsFile && custom.instructionsFile !== 'AGENTS.md') {
    await linkInstructions(chatDir, custom.instructionsFile)
  }
}

// ── Public API ──

const GENERATORS: Record<string, (ctx: ConfigContext) => Promise<void>> = {
  claude: configClaude,
  gemini: configGemini,
  codex: configCodex,
  opencode: configOpenCode,
  custom: configCustom,
}

export function getCliBaseDefaults(): Record<string, string> {
  return {
    claude: JSON.stringify({
      permissions: { deny: DEFAULT_DENY, defaultMode: 'bypassPermissions' },
    }, null, 2),
    gemini: JSON.stringify({}, null, 2),
    codex: 'approval_policy = "full-auto"\n',
    opencode: JSON.stringify({ permission: 'auto' }, null, 2),
  }
}

export async function generateCliConfig(
  chatDir: string,
  chatId: string,
  mcpPort: number,
  cliType: CliType,
  llmCommand: string,
): Promise<void> {
  const globalMcpServers = await getGlobalMcpServers()
  const ctx: ConfigContext = { chatDir, chatId, mcpPort, cliType, llmCommand, globalMcpServers }
  const generator = GENERATORS[cliType] ?? GENERATORS.custom
  await generator(ctx)
}
