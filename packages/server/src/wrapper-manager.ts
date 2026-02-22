import { join } from 'node:path'
import { mkdir, writeFile, readdir, unlink, chmod } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CHORALE_DIR } from './chorale-dirs'
import { getAdapterNames } from './agent-adapter'
import { getCustomLlms } from './config-service'
import { logger as rootLogger } from './logger'

const execAsync = promisify(execFile)
const log = rootLogger.child({ service: 'WrapperManager' })

export const BIN_DIR = join(CHORALE_DIR, 'bin')
export const SHELL_DIR = join(CHORALE_DIR, 'shell')

const WRAPPER_MARKER = '# chorale-managed-wrapper v1'

const WRAPPER_TEMPLATE = `#!/bin/sh
${WRAPPER_MARKER}
find_real_binary() {
  _OIFS="$IFS"; IFS=":"
  for _d in $PATH; do
    case "$_d" in "\${HOME}/.chorale/bin") continue ;; esac
    [ -x "\${_d}/\${1}" ] && IFS="$_OIFS" && echo "\${_d}/\${1}" && return 0
  done
  IFS="$_OIFS"; return 1
}
REAL="$(find_real_binary "__BINARY__")"
[ -z "$REAL" ] && echo "chorale: __BINARY__ not found" >&2 && exit 127
[ ! -f "\${HOME}/.chorale/.mcp-port" ] && exec "$REAL" "$@"
export CHORALE_REAL_BINARY="$REAL"
exec "$REAL" "$@"
`

const NOTIFY_SCRIPT = `#!/bin/sh
${WRAPPER_MARKER}
[ -z "$CHORALE_CHAT_ID" ] || [ ! -f "\${HOME}/.chorale/.mcp-port" ] && exit 0
PORT="$(cat "\${HOME}/.chorale/.mcp-port")"
EVENT="$1"; shift
TOOL=""; while [ $# -gt 0 ]; do case "$1" in --tool) TOOL="$2"; shift 2 ;; *) shift ;; esac; done
BODY="{\\"chat_id\\":\\"$CHORALE_CHAT_ID\\",\\"event\\":\\"$EVENT\\""
[ -n "$TOOL" ] && BODY="$BODY,\\"data\\":{\\"tool\\":\\"$TOOL\\"}"
BODY="$BODY}"
curl -s -X POST "http://localhost:$PORT/api/hooks?caller=$CHORALE_CHAT_ID" \\
  -H "Content-Type: application/json" -d "$BODY" --connect-timeout 1 --max-time 2 >/dev/null 2>&1 &
exit 0
`

const ZSHENV_TEMPLATE = `${WRAPPER_MARKER}
[ -f "\${CHORALE_REAL_ZDOTDIR:-$HOME}/.zshenv" ] && ZDOTDIR="\${CHORALE_REAL_ZDOTDIR:-$HOME}" source "\${CHORALE_REAL_ZDOTDIR:-$HOME}/.zshenv"
export PATH="\${HOME}/.chorale/bin:\${PATH}"
`

const BASHRC_TEMPLATE = `${WRAPPER_MARKER}
[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"
export PATH="\${HOME}/.chorale/bin:\${PATH}"
`

export class WrapperManager {
  private getDefaultLlm: () => string

  constructor(getDefaultLlm: () => string) {
    this.getDefaultLlm = getDefaultLlm
  }

  async setup(): Promise<void> {
    await mkdir(BIN_DIR, { recursive: true })
    await mkdir(join(SHELL_DIR, 'zsh'), { recursive: true })
    await mkdir(join(SHELL_DIR, 'bash'), { recursive: true })

    const binaries = new Set<string>(getAdapterNames())
    const customLlms = await getCustomLlms().catch(() => ({}))
    for (const name of Object.keys(customLlms)) {
      binaries.add(name)
    }
    const defaultLlm = this.getDefaultLlm().trim().split(/\s+/)[0].split('/').pop()
    if (defaultLlm) binaries.add(defaultLlm)

    const generated = new Set<string>()
    for (const binary of binaries) {
      const realPath = await this.findRealBinary(binary)
      if (realPath) {
        await this.generateWrapper(binary)
        generated.add(binary)
      }
    }

    await this.generateNotifyScript()
    await this.generateShellIntegration()
    await this.pruneStaleWrappers(generated)

    log.info('Wrappers setup complete', { count: generated.size, binaries: [...generated] })
  }

  async generateWrapper(binaryName: string): Promise<void> {
    const script = WRAPPER_TEMPLATE.replace(/__BINARY__/g, binaryName)
    const path = join(BIN_DIR, binaryName)
    await writeFile(path, script, 'utf-8')
    await chmod(path, 0o755)
  }

  async generateNotifyScript(): Promise<void> {
    const path = join(BIN_DIR, 'chorale-notify')
    await writeFile(path, NOTIFY_SCRIPT, 'utf-8')
    await chmod(path, 0o755)
  }

  async generateShellIntegration(): Promise<void> {
    await writeFile(join(SHELL_DIR, 'zsh', '.zshenv'), ZSHENV_TEMPLATE, 'utf-8')
    await writeFile(join(SHELL_DIR, 'bash', 'bashrc'), BASHRC_TEMPLATE, 'utf-8')
  }

  async pruneStaleWrappers(current: Set<string>): Promise<void> {
    const keepFiles = new Set([...current, 'chorale-notify'])
    try {
      const entries = await readdir(BIN_DIR)
      for (const entry of entries) {
        if (keepFiles.has(entry)) continue
        const path = join(BIN_DIR, entry)
        try {
          const { readFile: rf } = await import('node:fs/promises')
          const content = await rf(path, 'utf-8')
          if (content.includes(WRAPPER_MARKER)) {
            await unlink(path)
            log.info('Pruned stale wrapper', { binary: entry })
          }
        } catch {}
      }
    } catch {}
  }

  async findRealBinary(binaryName: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync('which', ['-a', binaryName])
      for (const p of stdout.trim().split('\n').filter(Boolean)) {
        if (p.startsWith(BIN_DIR)) continue
        return p
      }
    } catch {}
    return null
  }
}
