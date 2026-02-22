import { join } from 'node:path'
import { CHORALE_DIR } from './chorale-dirs'
import { loadJsonFile, saveJsonFile } from './claude-config'

export interface McpServerConfig {
  type: 'stdio' | 'http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

export interface CustomLlmConfig {
  command: string
  args?: string[]
  instructionsFile?: string
  mcpConfig?: {
    file: string
    template: Record<string, unknown>
  }
}

export interface ChoraleConfig {
  defaultLlm?: string
  globalMcpServers?: Record<string, McpServerConfig>
  customLlms?: Record<string, CustomLlmConfig>
}

const CONFIG_FILE = join(CHORALE_DIR, 'config.json')

export async function loadChoraleConfig(): Promise<ChoraleConfig> {
  return loadJsonFile<ChoraleConfig>(CONFIG_FILE, {})
}

export async function saveChoraleConfig(config: ChoraleConfig): Promise<void> {
  await saveJsonFile(CONFIG_FILE, config)
}

export async function getGlobalMcpServers(): Promise<Record<string, McpServerConfig>> {
  const config = await loadChoraleConfig()
  return config.globalMcpServers ?? {}
}

export async function getCustomLlms(): Promise<Record<string, CustomLlmConfig>> {
  const config = await loadChoraleConfig()
  return config.customLlms ?? {}
}
