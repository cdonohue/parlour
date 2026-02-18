import { app, BrowserWindow, ipcMain, Menu, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import {
  ApiServer, ParlourService, PtyManager, ChatRegistry, TaskScheduler, ThemeManager,
  ensureGlobalSkills, logger, lifecycle,
} from '@parlour/server'
import { IPC } from '../shared/ipc-channels'

let mainWindow: BrowserWindow | null = null
const ptyManager = new PtyManager()
let chatRegistry: ChatRegistry | null = null
let apiServer: ApiServer | null = null
let taskScheduler: TaskScheduler | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0b' : '#ffffff',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // needed for node-pty IPC
    },
  })

  // Show window when ready to avoid white flash (skip in tests)
  if (!process.env.CI_TEST) {
    mainWindow.on('ready-to-show', () => {
      mainWindow?.show()
    })
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.setName('Parlour')

// Isolate test data so e2e tests never touch real app state
if (process.env.CI_TEST) {
  const { mkdtempSync } = require('fs')
  const { join } = require('path')
  const testData = mkdtempSync(join(require('os').tmpdir(), 'parlour-test-'))
  app.setPath('userData', testData)
}

app.whenReady().then(async () => {
  // Custom menu: keep standard Edit shortcuts (copy/paste/undo) but remove
  // Cmd+W (close window) and Cmd+N (new window) so they reach the renderer
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }],
    },
  ])
  Menu.setApplicationMenu(menu)

  const stateFile = join(app.getPath('userData'), 'parlour-state.json')
  const settingsGetter = (): { llmCommand: string; maxChatDepth: number; projectRoots: string[]; theme: string } => {
    try {
      const data = require('fs').readFileSync(stateFile, 'utf-8')
      const state = JSON.parse(data)
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

  const themeManager = new ThemeManager()
  const persistedTheme = settingsGetter().theme ?? 'dark'
  const themeMode = persistedTheme as 'system' | 'dark' | 'light'
  nativeTheme.themeSource = themeMode === 'system' ? 'system' : themeMode
  themeManager.setMode(themeMode)
  themeManager.setResolved(nativeTheme.shouldUseDarkColors ? 'dark' : 'light')

  ipcMain.handle(IPC.THEME_SET_MODE, (_e, mode: string) => {
    nativeTheme.themeSource = mode === 'system' ? 'system' : (mode as 'light' | 'dark')
    themeManager.setMode(mode as 'system' | 'dark' | 'light')
  })

  nativeTheme.on('updated', () => {
    const resolved = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    themeManager.setResolved(resolved)
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.THEME_RESOLVED_CHANGED, resolved)
    }
  })

  const lifecycleLog = logger.child({ source: 'lifecycle' })
  lifecycle.on('*', (event) => lifecycleLog.info(event.type, event))

  await ensureGlobalSkills().catch((err) => logger.error('Failed to ensure global skills', { error: String(err) }))

  chatRegistry = new ChatRegistry(
    ptyManager,
    settingsGetter,
    () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
    (state) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.CHAT_REGISTRY_STATE_CHANGED, state)
      }
    },
  )
  await chatRegistry.loadFromDisk().catch((err) => logger.error('Failed to load chat registry', { error: String(err) }))
  chatRegistry.reconcilePtys()

  taskScheduler = new TaskScheduler(chatRegistry, settingsGetter, (schedules) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.SCHEDULE_CHANGED, schedules)
    }
  })
  await taskScheduler.loadAndStart().catch((err) => logger.error('Failed to load schedules', { error: String(err) }))

  registerIpcHandlers(ptyManager, taskScheduler, chatRegistry)

  const parlourService = new ParlourService(chatRegistry, ptyManager, taskScheduler, settingsGetter, themeManager, stateFile)
  apiServer = new ApiServer(parlourService, chatRegistry, taskScheduler)
  apiServer.start().catch((err) => logger.error('API server failed to start', { error: String(err) }))

  ipcMain.handle(IPC.API_GET_PORT, () => apiServer?.getPort() ?? 0)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  chatRegistry?.cleanup()
  chatRegistry?.flushPersist()
  taskScheduler?.destroyAll()
  apiServer?.stop()
  ptyManager.destroyAll()
})
