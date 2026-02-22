import { join } from 'node:path'
import { mkdir, writeFile, readFile, symlink, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { McpServerConfig } from './config-service'
import { getCustomLlms } from './config-service'
import { LLM_DEFAULTS_DIR } from './chorale-dirs'
import { ClaudeOutputParser, GenericOutputParser, type HarnessParser } from './harness-parser'

const DEFAULT_ALLOW = [
  'Bash(chorale *)',
]

const DEFAULT_DENY = [
  'Bash(rm -rf *)',
  'Bash(sudo *)',
  'Bash(chmod 777 *)',
  'Bash(mkfs *)',
  'Bash(dd *)',
  'Bash(git push --force *)',
  'Bash(git reset --hard *)',
]

export interface AdapterContext {
  chatDir: string
  llmCommand: string
  globalMcpServers: Record<string, McpServerConfig>
}

export interface EnvContext {
  chatId: string
  parentChatId?: string
}

export interface AgentAdapter {
  readonly name: string
  readonly resumeLast: string[]
  resumeWithId(id: string): string[]
  promptArgs(prompt: string): string[]
  readonly supportsPromptArgs: boolean
  readonly seedBufferOnResume: boolean
  generateConfig(ctx: AdapterContext): Promise<void>
  createParser(): HarnessParser
  buildEnv(ctx: EnvContext): Record<string, string>
  readonly hasNativeHooks: boolean
}

// ── Shared helpers ──

function buildMcpServers(
  globalServers: Record<string, McpServerConfig>,
): Record<string, unknown> {
  return { ...globalServers }
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

// ── Claude ──

class ClaudeAdapter implements AgentAdapter {
  readonly name = 'claude'
  readonly resumeLast = ['--continue']
  readonly supportsPromptArgs = true
  readonly seedBufferOnResume = true
  readonly hasNativeHooks = true

  resumeWithId(id: string): string[] { return ['--resume', id] }
  promptArgs(prompt: string): string[] { return [prompt] }
  createParser(): HarnessParser { return new ClaudeOutputParser() }
  buildEnv(): Record<string, string> { return {} }

  async generateConfig(ctx: AdapterContext): Promise<void> {
    const { chatDir, globalMcpServers } = ctx
    const mcpServers = buildMcpServers(globalMcpServers)

    await writeFile(join(chatDir, '.mcp.json'), JSON.stringify({ mcpServers }, null, 2), 'utf-8')

    await mkdir(join(chatDir, '.claude'), { recursive: true })
    let settings: Record<string, unknown> = {
      permissions: { allow: DEFAULT_ALLOW, deny: DEFAULT_DENY, defaultMode: 'bypassPermissions' },
      hooks: buildClaudeHooks(),
    }
    const raw = await readDefaults('claude', 'settings.local.json')
    if (raw) {
      try {
        const defaults = JSON.parse(raw)
        const mergedHooks = { ...buildClaudeHooks(), ...(defaults.hooks ?? {}) }
        settings = { ...settings, ...defaults, hooks: mergedHooks }
      } catch {}
    }
    await writeFile(join(chatDir, '.claude', 'settings.local.json'), JSON.stringify(settings, null, 2), 'utf-8')

    await linkInstructions(chatDir, 'CLAUDE.md')
  }
}

function buildClaudeHooks(): Record<string, unknown[]> {
  return {
    PreToolUse: [{ hooks: [{ type: 'command', command: 'chorale hook pre-tool-use' }] }],
    PostToolUse: [{ hooks: [{ type: 'command', command: 'chorale hook post-tool-use' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'chorale hook stop' }] }],
  }
}

// ── Gemini ──

class GeminiAdapter implements AgentAdapter {
  readonly name = 'gemini'
  readonly resumeLast = ['--resume']
  readonly supportsPromptArgs = true
  readonly seedBufferOnResume = true
  readonly hasNativeHooks = true

  resumeWithId(id: string): string[] { return ['--resume', id] }
  promptArgs(prompt: string): string[] { return [prompt] }
  createParser(): HarnessParser { return new GenericOutputParser() }
  buildEnv(): Record<string, string> { return {} }

  async generateConfig(ctx: AdapterContext): Promise<void> {
    const { chatDir, globalMcpServers } = ctx

    await mkdir(join(chatDir, '.gemini'), { recursive: true })
    const mcpServers = buildMcpServers(globalMcpServers)

    const geminiServers: Record<string, unknown> = {}
    for (const [name, config] of Object.entries(mcpServers)) {
      geminiServers[name] = { ...(config as object), trust: true }
    }

    let settings: Record<string, unknown> = {
      mcpServers: geminiServers,
      hooks: buildGeminiHooks(),
    }
    const raw = await readDefaults('gemini', 'settings.json')
    if (raw) {
      try {
        const defaults = JSON.parse(raw)
        const mergedHooks = { ...buildGeminiHooks(), ...(defaults.hooks ?? {}) }
        settings = {
          ...defaults,
          mcpServers: { ...(defaults.mcpServers ?? {}), ...geminiServers },
          hooks: mergedHooks,
        }
      } catch {}
    }

    await writeFile(join(chatDir, '.gemini', 'settings.json'), JSON.stringify(settings, null, 2), 'utf-8')
    await linkInstructions(chatDir, 'GEMINI.md')
  }
}

function buildGeminiHooks(): Record<string, unknown[]> {
  return {
    BeforeTool: [{ hooks: [{ type: 'command', command: 'chorale-notify pre-tool-use --tool $TOOL_NAME' }] }],
    AfterTool: [{ hooks: [{ type: 'command', command: 'chorale-notify post-tool-use --tool $TOOL_NAME' }] }],
    SessionEnd: [{ hooks: [{ type: 'command', command: 'chorale-notify stop' }] }],
  }
}

// ── Codex ──

class CodexAdapter implements AgentAdapter {
  readonly name = 'codex'
  readonly resumeLast = ['resume', '--last']
  readonly supportsPromptArgs = true
  readonly seedBufferOnResume = false
  readonly hasNativeHooks = true

  resumeWithId(id: string): string[] { return ['resume', id] }
  promptArgs(prompt: string): string[] { return [prompt] }
  createParser(): HarnessParser { return new GenericOutputParser() }
  buildEnv(): Record<string, string> { return {} }

  async generateConfig(ctx: AdapterContext): Promise<void> {
    const { chatDir, globalMcpServers } = ctx

    await mkdir(join(chatDir, '.codex'), { recursive: true })
    const mcpServers = buildMcpServers(globalMcpServers)

    let toml = 'approval_policy = "never"\n'
    toml += 'notify = ["chorale-notify", "stop"]\n\n'

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
      const nonMcp = raw.split('\n').filter((l) => !l.startsWith('[mcp.') && !l.startsWith('approval_policy') && !l.startsWith('notify'))
      if (nonMcp.some((l) => l.trim())) toml += nonMcp.join('\n')
    }

    await writeFile(join(chatDir, '.codex', 'config.toml'), toml, 'utf-8')
  }
}

// ── OpenCode ──

class OpenCodeAdapter implements AgentAdapter {
  readonly name = 'opencode'
  readonly resumeLast = ['--continue']
  readonly supportsPromptArgs = true
  readonly seedBufferOnResume = false
  readonly hasNativeHooks = true

  resumeWithId(id: string): string[] { return ['--session', id] }
  promptArgs(prompt: string): string[] { return ['--prompt', prompt] }
  createParser(): HarnessParser { return new GenericOutputParser() }
  buildEnv(): Record<string, string> { return {} }

  async generateConfig(ctx: AdapterContext): Promise<void> {
    const { chatDir } = ctx

    const pluginDir = join(chatDir, '.opencode', 'plugins')
    await mkdir(pluginDir, { recursive: true })
    const templatePath = join(import.meta.dirname, 'templates', 'opencode-plugin.js')
    const template = await readFile(templatePath, 'utf-8')
    const pluginPath = join(pluginDir, 'chorale-plugin.js')
    await writeFile(pluginPath, template, 'utf-8')

    let config: Record<string, unknown> = {
      plugin: [`file://${pluginPath}`],
    }
    const raw = await readDefaults('opencode', 'opencode.json')
    if (raw) {
      try {
        const defaults = JSON.parse(raw)
        const existingPlugins = Array.isArray(defaults.plugin) ? defaults.plugin : []
        config = { ...defaults, plugin: [...existingPlugins, `file://${pluginPath}`] }
      } catch {}
    }

    await writeFile(join(chatDir, 'opencode.json'), JSON.stringify(config, null, 2), 'utf-8')
  }
}

// ── Aider ──

class AiderAdapter implements AgentAdapter {
  readonly name = 'aider'
  readonly resumeLast: string[] = []
  readonly supportsPromptArgs = false
  readonly seedBufferOnResume = true
  readonly hasNativeHooks = true

  resumeWithId(): string[] { return [] }
  promptArgs(): string[] { return [] }
  createParser(): HarnessParser { return new GenericOutputParser() }

  buildEnv(): Record<string, string> {
    return {
      AIDER_NOTIFICATIONS_COMMAND: 'chorale-notify stop',
      AIDER_NOTIFICATIONS: '1',
    }
  }

  async generateConfig(): Promise<void> {}
}

// ── Generic / Custom ──

class GenericAdapter implements AgentAdapter {
  readonly name = 'generic'
  readonly resumeLast: string[] = []
  readonly supportsPromptArgs = false
  readonly seedBufferOnResume = true
  readonly hasNativeHooks = false

  resumeWithId(): string[] { return [] }
  promptArgs(): string[] { return [] }
  createParser(): HarnessParser { return new GenericOutputParser() }
  buildEnv(): Record<string, string> { return {} }

  async generateConfig(ctx: AdapterContext): Promise<void> {
    const { chatDir, llmCommand, globalMcpServers } = ctx
    const customLlms = await getCustomLlms()
    const cmd = llmCommand.trim().split(/\s+/)[0].split('/').pop() ?? llmCommand
    const custom = customLlms[cmd]

    if (!custom?.mcpConfig) {
      await new ClaudeAdapter().generateConfig(ctx)
      return
    }

    const config = JSON.parse(JSON.stringify(custom.mcpConfig.template))

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
}

// ── Registry ──

const ADAPTER_REGISTRY = new Map<string, AgentAdapter>([
  ['claude', new ClaudeAdapter()],
  ['gemini', new GeminiAdapter()],
  ['codex', new CodexAdapter()],
  ['opencode', new OpenCodeAdapter()],
  ['aider', new AiderAdapter()],
])

export function resolveAdapter(llmCommand: string): AgentAdapter {
  const base = llmCommand.trim().split(/\s+/)[0].split('/').pop() ?? llmCommand
  return ADAPTER_REGISTRY.get(base) ?? new GenericAdapter()
}

export function getAdapterNames(): string[] {
  return Array.from(ADAPTER_REGISTRY.keys())
}

export function getCliBaseDefaults(): Record<string, string> {
  return {
    claude: JSON.stringify({
      permissions: { allow: DEFAULT_ALLOW, deny: DEFAULT_DENY, defaultMode: 'bypassPermissions' },
    }, null, 2),
    gemini: JSON.stringify({}, null, 2),
    codex: 'approval_policy = "full-auto"\n',
    opencode: JSON.stringify({}, null, 2),
  }
}
