import * as pty from 'node-pty'
import { mkdir } from 'node:fs/promises'

interface PtyInstance {
  process: pty.IPty
  onExitCallbacks: Array<(exitCode: number) => void>
  onActivityCallbacks: Array<(ptyId: string) => void>
  onOutputCallbacks: Array<(ptyId: string, data: string) => void>
  onTitleCallbacks: Array<(ptyId: string, title: string) => void>
  onFirstInputCallbacks: Array<(ptyId: string, input: string) => void>
  inputBuffer: string
  detectedTitle: string | null
  outputBuffer: string
  firstInputEmitted: boolean
  firstInputLines: string[]
  lastOutputAt: number
}

export class PtyManager {
  private ptys = new Map<string, PtyInstance>()
  private nextId = 0

  async create(workingDir: string, shell?: string, command?: string[], initialWrite?: string, extraEnv?: Record<string, string>): Promise<string> {
    const id = `pty-${++this.nextId}`

    let file: string
    let args: string[]
    if (command && command.length > 0) {
      file = command[0]
      args = command.slice(1)
    } else {
      file = (shell && shell.trim()) || process.env.SHELL || '/bin/zsh'
      args = []
    }

    await mkdir(workingDir, { recursive: true })
    const { CLAUDECODE, ...cleanEnv } = process.env
    const proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: workingDir,
      env: {
        ...cleanEnv,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...extraEnv,
      } as Record<string, string>,
    })

    const instance: PtyInstance = { process: proc, onExitCallbacks: [], onActivityCallbacks: [], onOutputCallbacks: [], onTitleCallbacks: [], onFirstInputCallbacks: [], inputBuffer: '', detectedTitle: null, outputBuffer: '', firstInputEmitted: false, firstInputLines: [], lastOutputAt: Date.now() }

    let pendingWrite = initialWrite
    proc.onData((data) => {
      instance.lastOutputAt = Date.now()
      instance.outputBuffer += data
      if (instance.outputBuffer.length > 200_000) {
        instance.outputBuffer = instance.outputBuffer.slice(-100_000)
      }
      for (const cb of instance.onActivityCallbacks) cb(id)
      for (const cb of instance.onOutputCallbacks) cb(id, data)
      this.extractOscTitle(id, data, instance)
      if (pendingWrite) {
        const toWrite = pendingWrite
        pendingWrite = undefined
        proc.write(toWrite)
      }
    })

    proc.onExit(({ exitCode }) => {
      for (const cb of instance.onExitCallbacks) cb(exitCode)
      this.ptys.delete(id)
    })

    this.ptys.set(id, instance)
    return id
  }

  onExit(ptyId: string, callback: (exitCode: number) => void): void {
    const instance = this.ptys.get(ptyId)
    if (instance) instance.onExitCallbacks.push(callback)
  }

  onActivity(ptyId: string, callback: (ptyId: string) => void): void {
    const instance = this.ptys.get(ptyId)
    if (instance) instance.onActivityCallbacks.push(callback)
  }

  onOutput(ptyId: string, callback: (ptyId: string, data: string) => void): void {
    const instance = this.ptys.get(ptyId)
    if (instance) instance.onOutputCallbacks.push(callback)
  }

  onTitle(ptyId: string, callback: (ptyId: string, title: string) => void): void {
    const instance = this.ptys.get(ptyId)
    if (instance) instance.onTitleCallbacks.push(callback)
  }

  onFirstInput(ptyId: string, callback: (ptyId: string, input: string) => void): void {
    const instance = this.ptys.get(ptyId)
    if (instance) instance.onFirstInputCallbacks.push(callback)
  }

  getLastOutputAt(ptyId: string): number | null {
    return this.ptys.get(ptyId)?.lastOutputAt ?? null
  }

  write(ptyId: string, data: string): void {
    const instance = this.ptys.get(ptyId)
    if (!instance) return

    let i = 0
    while (i < data.length) {
      const ch = data[i]

      if (ch === '\x1b') {
        i++
        if (i < data.length && data[i] === '[') {
          i++
          while (i < data.length && data[i] >= '0' && data[i] <= '?') i++
          while (i < data.length && data[i] >= ' ' && data[i] <= '/') i++
          if (i < data.length) i++
        } else if (i < data.length && data[i] === ']') {
          while (i < data.length && data[i] !== '\x07' && !(data[i] === '\x1b' && data[i + 1] === '\\')) i++
          if (i < data.length) i += data[i] === '\x07' ? 1 : 2
        } else if (i < data.length) {
          i++
        }
        continue
      }

      if (ch === '\r' || ch === '\n') {
        const cmd = instance.inputBuffer.trim()
        instance.inputBuffer = ''
        if (cmd && !instance.firstInputEmitted) {
          instance.firstInputLines.push(cmd)
        }
        if (cmd && this.detectTitle(cmd) !== instance.detectedTitle) {
          instance.detectedTitle = this.detectTitle(cmd)
          if (instance.detectedTitle) {
            for (const cb of instance.onTitleCallbacks) cb(ptyId, instance.detectedTitle)
          }
        }
      } else if (ch === '\x7f' || ch === '\b') {
        instance.inputBuffer = instance.inputBuffer.slice(0, -1)
      } else if (ch >= ' ') {
        instance.inputBuffer += ch
      }

      i++
    }

    if (!instance.firstInputEmitted && instance.firstInputLines.length > 0) {
      instance.firstInputEmitted = true
      const fullInput = instance.firstInputLines.join('\n')
      instance.firstInputLines = []
      for (const cb of instance.onFirstInputCallbacks) cb(ptyId, fullInput)
    }

    instance.process.write(data)
  }

  private static OSC_RE = /\x1b\](?:0|2);([^\x07\x1b]*)\x07/g

  private extractOscTitle(ptyId: string, data: string, instance: PtyInstance): void {
    PtyManager.OSC_RE.lastIndex = 0
    let match: RegExpExecArray | null
    let title: string | null = null
    while ((match = PtyManager.OSC_RE.exec(data)) !== null) {
      if (match[1].trim()) title = match[1].trim()
    }
    if (title && title !== instance.detectedTitle) {
      instance.detectedTitle = title
      for (const cb of instance.onTitleCallbacks) cb(ptyId, title)
    }
  }

  private detectTitle(cmd: string): string | null {
    const bin = cmd.split(/\s/)[0]
    if (bin === 'claude' || bin.endsWith('/claude')) return 'Claude'
    return null
  }

  resize(ptyId: string, cols: number, rows: number): void {
    try {
      this.ptys.get(ptyId)?.process.resize(cols, rows)
    } catch {
      // PTY file descriptor may be stale after restart
    }
  }

  destroy(ptyId: string): void {
    const instance = this.ptys.get(ptyId)
    if (instance) {
      instance.process.kill()
      this.ptys.delete(ptyId)
    }
  }

  getBuffer(ptyId: string): string {
    return this.ptys.get(ptyId)?.outputBuffer ?? ''
  }

  seedBuffer(ptyId: string, data: string): void {
    const instance = this.ptys.get(ptyId)
    if (!instance) return
    const cleaned = data.replace(/\x1b\[\?(?:1004|2004|2026|25)[hl]/g, '')
      .replace(/\x1b\[>[0-9]*u/g, '')
      .replace(/\x1b\[<u/g, '')
    instance.outputBuffer = cleaned + instance.outputBuffer
  }

  list(): string[] {
    return Array.from(this.ptys.keys())
  }

  writeWhenReady(ptyId: string, text: string, submit = true): Promise<void> {
    const instance = this.ptys.get(ptyId)
    if (!instance) return Promise.reject(new Error(`PTY ${ptyId} not found`))

    const maxAttempts = 30 + this.ptys.size * 10

    return new Promise((resolve, reject) => {
      let attempts = 0
      const poll = () => {
        if (!this.ptys.has(ptyId)) {
          reject(new Error(`PTY ${ptyId} exited before ready`))
          return
        }
        if (++attempts > maxAttempts) {
          reject(new Error(`PTY ${ptyId} not ready after ${maxAttempts * 500 / 1000}s (${this.ptys.size} concurrent)`))
          return
        }
        if (instance.detectedTitle || instance.outputBuffer.length > 0) {
          this.write(ptyId, text)
          if (submit) setTimeout(() => this.write(ptyId, '\r'), 100)
          resolve()
        } else {
          setTimeout(poll, 500)
        }
      }
      setTimeout(poll, 500)
    })
  }

  destroyAll(): void {
    for (const [id] of this.ptys) {
      this.destroy(id)
    }
  }
}
