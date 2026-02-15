import { join } from 'node:path'
import { PARLOUR_DIR } from './parlour-dirs'
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

export interface ParlourConfig {
  defaultLlm?: string
  globalMcpServers?: Record<string, McpServerConfig>
  customLlms?: Record<string, CustomLlmConfig>
}

const CONFIG_FILE = join(PARLOUR_DIR, 'config.json')

export async function loadParlourConfig(): Promise<ParlourConfig> {
  return loadJsonFile<ParlourConfig>(CONFIG_FILE, {})
}

export async function saveParlourConfig(config: ParlourConfig): Promise<void> {
  await saveJsonFile(CONFIG_FILE, config)
}

export async function getGlobalMcpServers(): Promise<Record<string, McpServerConfig>> {
  const config = await loadParlourConfig()
  return config.globalMcpServers ?? {}
}

export async function getCustomLlms(): Promise<Record<string, CustomLlmConfig>> {
  const config = await loadParlourConfig()
  return config.customLlms ?? {}
}
