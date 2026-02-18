import { app, BrowserWindow, ipcMain, Menu, nativeTheme, shell, dialog } from 'electron'
import { join } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { readFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { IPC } from '../shared/ipc-channels'

let mainWindow: BrowserWindow | null = null
let serverProcess: ChildProcess | null = null
let serverPort = 0

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
      sandbox: false,
    },
  })

  if (!process.env.CI_TEST) {
    mainWindow.on('ready-to-show', () => mainWindow?.show())
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function readPersistedTheme(dataDir: string): string {
  try {
    const data = readFileSync(join(dataDir, 'parlour-state.json'), 'utf-8')
    return JSON.parse(data)?.settings?.theme ?? 'dark'
  } catch {
    return 'dark'
  }
}

function spawnServer(dataDir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const serverEntry = join(__dirname, '../../../packages/server/src/main.ts')
    const tsx = join(__dirname, '../../../node_modules/.bin/tsx')
    serverProcess = spawn(tsx, [serverEntry, '--port', '0', '--data-dir', dataDir], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let resolved = false

    serverProcess.stdout!.on('data', (chunk: Buffer) => {
      if (resolved) return
      const match = chunk.toString().match(/PORT=(\d+)/)
      if (match) {
        resolved = true
        resolve(parseInt(match[1], 10))
      }
    })

    serverProcess.stderr!.on('data', (chunk: Buffer) => {
      console.error('[server]', chunk.toString().trimEnd())
    })

    serverProcess.on('error', (err) => {
      if (!resolved) reject(err)
    })

    serverProcess.on('exit', (code) => {
      if (!resolved) reject(new Error(`Server exited with code ${code}`))
    })
  })
}

app.setName('Parlour')

let dataDir = app.getPath('userData')

if (process.env.CI_TEST) {
  const testData = mkdtempSync(join(tmpdir(), 'parlour-test-'))
  app.setPath('userData', testData)
  dataDir = testData
}

app.whenReady().then(async () => {
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

  const themeMode = readPersistedTheme(dataDir)
  nativeTheme.themeSource = themeMode === 'system' ? 'system' : (themeMode as 'light' | 'dark')

  serverPort = await spawnServer(dataDir)

  // Sync IPC: preload reads server URL synchronously at startup
  ipcMain.on(IPC.SERVER_GET_URL, (event) => {
    event.returnValue = `http://localhost:${serverPort}`
  })

  ipcMain.handle(IPC.APP_SELECT_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Repository',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.SHELL_OPEN_EXTERNAL, async (_e, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle(IPC.THEME_SET_MODE, async (_e, mode: string) => {
    nativeTheme.themeSource = mode === 'system' ? 'system' : (mode as 'light' | 'dark')
    fetch(`http://localhost:${serverPort}/api/theme/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    }).catch(() => {})
  })

  nativeTheme.on('updated', () => {
    const resolved = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.THEME_RESOLVED_CHANGED, resolved)
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM')
  }
})
