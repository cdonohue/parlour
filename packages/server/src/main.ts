import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { PtyManager } from './pty-manager'
import { ChatRegistry } from './chat-registry'
import { TaskScheduler } from './task-scheduler'
import { ThemeManager } from './theme-manager'
import { ParlourService } from './parlour-service'
import { ApiServer } from './api-server'
import { PARLOUR_DIR, ensureGlobalSkills } from './parlour-dirs'
import { logger } from './logger'
import { lifecycle } from './lifecycle'

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '0' },
    'data-dir': { type: 'string', default: PARLOUR_DIR },
  },
})

const dataDir = values['data-dir']!
const stateFile = join(dataDir, 'parlour-state.json')

function readSettings(): { llmCommand: string; maxChatDepth: number; projectRoots: string[]; theme: string } {
  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf-8'))
    return {
      llmCommand: state?.settings?.llmCommand ?? 'claude',
      maxChatDepth: state?.settings?.maxChatDepth ?? 2,
      projectRoots: state?.settings?.projectRoots ?? [],
      theme: state?.settings?.theme ?? 'dark',
    }
  } catch {
    return { llmCommand: 'claude', maxChatDepth: 2, projectRoots: [], theme: 'dark' }
  }
}

const lifecycleLog = logger.child({ source: 'lifecycle' })
lifecycle.on('*', (event) => lifecycleLog.info(event.type, event))

await ensureGlobalSkills().catch((err) => logger.error('Failed to ensure global skills', { error: String(err) }))

const themeManager = new ThemeManager()
const settings = readSettings()
themeManager.setMode((settings.theme as 'system' | 'dark' | 'light') ?? 'dark')
themeManager.setResolved(settings.theme === 'light' ? 'light' : 'dark')

const ptyManager = new PtyManager()

const chatRegistry = new ChatRegistry(
  ptyManager,
  readSettings,
  () => themeManager.getResolved(),
  () => {},
)
await chatRegistry.loadFromDisk().catch((err) => logger.error('Failed to load chat registry', { error: String(err) }))
chatRegistry.reconcilePtys()

const taskScheduler = new TaskScheduler(chatRegistry, readSettings, () => {})
await taskScheduler.loadAndStart().catch((err) => logger.error('Failed to load schedules', { error: String(err) }))

const parlourService = new ParlourService(chatRegistry, ptyManager, taskScheduler, readSettings, themeManager, stateFile)
const apiServer = new ApiServer(parlourService, chatRegistry, taskScheduler)

const requestedPort = parseInt(values.port!, 10) || 3000
const port = await apiServer.start(requestedPort)
console.log(`PORT=${port}`)

function shutdown(): void {
  chatRegistry.cleanup()
  chatRegistry.flushPersist()
  taskScheduler.destroyAll()
  apiServer.stop()
  ptyManager.destroyAll()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
