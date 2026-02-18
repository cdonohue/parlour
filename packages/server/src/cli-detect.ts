import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

interface CliDef {
  resumeWithId: (id: string) => string[]
  resumeLast: string[]
}

const CLI_REGISTRY: Record<string, CliDef> = {
  claude: {
    resumeWithId: (id) => ['--resume', id],
    resumeLast: ['--continue'],
  },
  gemini: {
    resumeWithId: (id) => ['--resume', id],
    resumeLast: ['--resume'],
  },
  codex: {
    resumeWithId: (id) => ['resume', id],
    resumeLast: ['resume', '--last'],
  },
  opencode: {
    resumeWithId: (id) => ['--session', id],
    resumeLast: ['--continue'],
  },
}

export const KNOWN_CLIS = Object.keys(CLI_REGISTRY) as readonly string[]
export type CliType = string

export function getResumeArgs(cliType: string, sessionId?: string): string[] {
  const def = CLI_REGISTRY[cliType]
  if (!def) return []
  return sessionId ? def.resumeWithId(sessionId) : def.resumeLast
}

export async function detectInstalledClis(): Promise<string[]> {
  const results = await Promise.all(
    KNOWN_CLIS.map(async (cli) => {
      try {
        await exec('which', [cli])
        return cli
      } catch {
        return null
      }
    }),
  )
  return results.filter((r): r is string => r !== null)
}

export function resolveCliType(llmCommand: string): CliType {
  const base = llmCommand.trim().split(/\s+/)[0].split('/').pop() ?? llmCommand
  if (base in CLI_REGISTRY) return base
  return 'custom'
}
