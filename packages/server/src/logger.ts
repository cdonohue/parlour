import { join } from 'node:path'
import { mkdirSync, appendFileSync, statSync, renameSync } from 'node:fs'
import { CHORALE_DIR } from './chorale-dirs'

type Level = 'error' | 'warn' | 'info' | 'debug'
type Ctx = Record<string, unknown>

const LEVELS: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 }
const LOG_DIR = join(CHORALE_DIR, 'logs')
const LOG_FILE = join(LOG_DIR, 'chorale.jsonl')
const MAX_SIZE = 5 * 1024 * 1024

let threshold: number = LEVELS.info
let dirReady = false

function ensureDir(): void {
  if (dirReady) return
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    dirReady = true
  } catch {}
}

function rotateIfNeeded(): void {
  try {
    const size = statSync(LOG_FILE).size
    if (size > MAX_SIZE) {
      renameSync(LOG_FILE, LOG_FILE.replace('.jsonl', '.1.jsonl'))
    }
  } catch {}
}

function write(level: Level, msg: string, ctx: Ctx): void {
  if (LEVELS[level] > threshold) return

  const entry = { ts: new Date().toISOString(), level, msg, ...ctx }

  if (process.env.NODE_ENV !== 'production' || process.env.CHORALE_LOG_LEVEL) {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    fn(`[${level}] ${msg}`, Object.keys(ctx).length > 0 ? ctx : '')
  }

  ensureDir()
  rotateIfNeeded()
  try {
    appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n')
  } catch {}
}

export interface Logger {
  error(msg: string, ctx?: Ctx): void
  warn(msg: string, ctx?: Ctx): void
  info(msg: string, ctx?: Ctx): void
  debug(msg: string, ctx?: Ctx): void
  child(extra: Ctx): Logger
}

function createLogger(base: Ctx = {}): Logger {
  return {
    error: (msg, ctx) => write('error', msg, { ...base, ...ctx }),
    warn: (msg, ctx) => write('warn', msg, { ...base, ...ctx }),
    info: (msg, ctx) => write('info', msg, { ...base, ...ctx }),
    debug: (msg, ctx) => write('debug', msg, { ...base, ...ctx }),
    child: (extra) => createLogger({ ...base, ...extra }),
  }
}

export const logger = createLogger()

const envLevel = process.env.CHORALE_LOG_LEVEL as Level | undefined
if (envLevel && envLevel in LEVELS) {
  threshold = LEVELS[envLevel]
}
