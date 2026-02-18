import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi, beforeAll, afterAll } from 'vitest'

export interface TestServer {
  port: number
  baseUrl: string
  dataDir: string
  fetch: (path: string, opts?: RequestInit) => Promise<Response>
  cleanup: () => Promise<void>
}

export async function createTestServer(): Promise<TestServer> {
  const dataDir = await mkdtemp(join(tmpdir(), 'parlour-test-'))
  const stateFile = join(dataDir, 'parlour-state.json')

  vi.doMock('../parlour-dirs', () => ({
    PARLOUR_DIR: dataDir,
    BARE_DIR: join(dataDir, 'bare'),
    PROJECT_SETUP_DIR: join(dataDir, 'project-setup'),
    SKILLS_DIR: join(dataDir, 'skills'),
    LLM_DEFAULTS_DIR: join(dataDir, 'llm-defaults'),
    createChatDir: async (chatId: string, parentDirPath?: string) => {
      const { mkdir } = await import('node:fs/promises')
      const chatDir = parentDirPath
        ? join(parentDirPath, 'chats', chatId)
        : join(dataDir, 'chats', chatId)
      await mkdir(join(chatDir, 'projects'), { recursive: true })
      return chatDir
    },
    writeAgentsMd: async () => {},
    scanProjects: async () => [],
    scanProjectRoots: async () => [],
    ensureGlobalSkills: async () => {},
    copySkillsToChat: async () => {},
    scanSkills: async () => [],
    getClaudeSessionId: async () => null,
  }))

  vi.doMock('../logger', () => {
    const noop = () => {}
    const noopLogger = { error: noop, warn: noop, info: noop, debug: noop, child: () => noopLogger }
    return { logger: noopLogger }
  })

  const { ThemeManager } = await import('../theme-manager')
  const { PtyManager } = await import('../pty-manager')
  const { ChatRegistry } = await import('../chat-registry')
  const { TaskScheduler } = await import('../task-scheduler')
  const { ParlourService } = await import('../parlour-service')
  const { ApiServer } = await import('../api-server')

  const themeManager = new ThemeManager()
  themeManager.setMode('dark')
  themeManager.setResolved('dark')

  const ptyManager = new PtyManager()
  const settings = () => ({ llmCommand: 'echo', maxChatDepth: 2, projectRoots: [] })

  const chatRegistry = new ChatRegistry(
    ptyManager,
    settings,
    () => themeManager.getResolved(),
    () => {},
  )
  await chatRegistry.loadFromDisk().catch(() => {})

  const taskScheduler = new TaskScheduler(chatRegistry, settings, () => {})
  await taskScheduler.loadAndStart().catch(() => {})

  const parlourService = new ParlourService(
    chatRegistry, ptyManager, taskScheduler, settings, themeManager, stateFile,
  )
  const apiServer = new ApiServer(parlourService, chatRegistry, taskScheduler)

  const port = await apiServer.start()
  const baseUrl = `http://127.0.0.1:${port}`

  const fetchApi = (path: string, opts?: RequestInit): Promise<Response> =>
    fetch(`${baseUrl}/api${path}`, opts)

  const cleanup = async (): Promise<void> => {
    ptyManager.destroyAll()
    taskScheduler.destroyAll()
    chatRegistry.cleanup()
    await apiServer.stop()
    await rm(dataDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  }

  return { port, baseUrl, dataDir, fetch: fetchApi, cleanup }
}

export function useTestServer(): { server: () => TestServer } {
  let server: TestServer

  beforeAll(async () => {
    server = await createTestServer()
  }, 30_000)

  afterAll(async () => {
    await server?.cleanup()
  }, 10_000)

  return { server: () => server }
}
