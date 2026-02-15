import { ipcMain, dialog, app, BrowserWindow } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { mkdir, rm, readFile } from 'fs/promises'
import { IPC } from '../shared/ipc-channels'
import { PtyManager } from './pty-manager'
import { GitService } from './git-service'
import { ForgeService } from './forge-service'
import { FileService } from './file-service'
import { TaskScheduler } from './task-scheduler'
import { ChatRegistry } from './chat-registry'
import { loadJsonFile, saveJsonFile } from './claude-config'
import { PARLOUR_DIR, createChatDir, writeAgentsMd, getClaudeSessionId } from './parlour-dirs'
import { detectInstalledClis } from './cli-detect'
import { getCliBaseDefaults } from './cli-config'

let ptyManager: PtyManager
let taskScheduler: TaskScheduler
let chatRegistry: ChatRegistry

const home = homedir()
function expandTilde(p: string): string {
  if (p.startsWith('~/')) return home + p.slice(1)
  if (p === '~') return home
  return p
}

export function registerIpcHandlers(sharedPtyManager: PtyManager, sharedTaskScheduler: TaskScheduler, sharedChatRegistry: ChatRegistry): void {
  ptyManager = sharedPtyManager
  taskScheduler = sharedTaskScheduler
  chatRegistry = sharedChatRegistry
  // ── Git handlers ──
  ipcMain.handle(IPC.GIT_GET_STATUS, async (_e, repoPath: string) => {
    return GitService.getStatus(repoPath)
  })

  ipcMain.handle(IPC.GIT_GET_DIFF, async (_e, repoPath: string, staged: boolean) => {
    return GitService.getDiff(repoPath, staged)
  })

  ipcMain.handle(IPC.GIT_GET_FILE_DIFF, async (_e, repoPath: string, filePath: string) => {
    return GitService.getFileDiff(repoPath, filePath)
  })

  ipcMain.handle(IPC.GIT_GET_BRANCHES, async (_e, repoPath: string) => {
    return GitService.getBranches(expandTilde(repoPath))
  })

  ipcMain.handle(IPC.GIT_STAGE, async (_e, repoPath: string, paths: string[]) => {
    return GitService.stage(repoPath, paths)
  })

  ipcMain.handle(IPC.GIT_UNSTAGE, async (_e, repoPath: string, paths: string[]) => {
    return GitService.unstage(repoPath, paths)
  })

  ipcMain.handle(IPC.GIT_DISCARD, async (_e, repoPath: string, paths: string[], untracked: string[]) => {
    return GitService.discard(repoPath, paths, untracked)
  })

  ipcMain.handle(IPC.GIT_COMMIT, async (_e, repoPath: string, message: string) => {
    return GitService.commit(repoPath, message)
  })

  ipcMain.handle(IPC.GIT_GET_CURRENT_BRANCH, async (_e, repoPath: string) => {
    return GitService.getCurrentBranch(repoPath)
  })

  ipcMain.handle(IPC.GIT_IS_REPO, async (_e, dirPath: string) => {
    return GitService.isGitRepo(expandTilde(dirPath))
  })

  ipcMain.handle(IPC.GIT_GET_PARENT_BRANCH, async (_e, repoPath: string, branch: string) => {
    return GitService.getParentBranch(repoPath, branch)
  })

  ipcMain.handle(IPC.GIT_CLONE_BARE, async (_e, url: string, targetDir: string) => {
    return GitService.cloneBare(url, targetDir)
  })

  // ── GitHub handlers ──
  ipcMain.handle(IPC.GITHUB_GET_PR_STATUSES, async (_e, repoPath: string, branches: string[]) => {
    return ForgeService.getPrStatuses(repoPath, branches)
  })

  // ── PTY handlers ──
  ipcMain.handle(IPC.PTY_CREATE, async (_e, workingDir: string, shell?: string, extraEnv?: Record<string, string>, command?: string[]) => {
    const win = BrowserWindow.fromWebContents(_e.sender)
    if (!win) throw new Error('No window found')
    const ptyId = await ptyManager.create(workingDir, win.webContents, shell, command, undefined, extraEnv)
    ptyManager.onExit(ptyId, (exitCode) => {
      if (!win.isDestroyed()) {
        win.webContents.send(`${IPC.PTY_EXIT}:${ptyId}`, exitCode)
      }
    })
    return ptyId
  })

  ipcMain.on(IPC.PTY_WRITE, (_e, ptyId: string, data: string) => {
    ptyManager.write(ptyId, data)
  })

  ipcMain.on(IPC.PTY_RESIZE, (_e, ptyId: string, cols: number, rows: number) => {
    ptyManager.resize(ptyId, cols, rows)
  })

  ipcMain.on(IPC.PTY_DESTROY, (_e, ptyId: string) => {
    ptyManager.destroy(ptyId)
  })

  ipcMain.handle(IPC.PTY_LIST, async () => {
    return ptyManager.list()
  })

  ipcMain.handle(IPC.PTY_GET_BUFFER, async (_e, ptyId: string) => {
    return ptyManager.getBuffer(ptyId)
  })

  ipcMain.handle(IPC.PTY_REATTACH, async (_e, ptyId: string) => {
    const win = BrowserWindow.fromWebContents(_e.sender)
    if (!win) throw new Error('No window found')
    return ptyManager.reattach(ptyId, win.webContents)
  })

  // ── File handlers ──
  ipcMain.handle(IPC.FS_READ_FILE, async (_e, filePath: string) => {
    return FileService.readFile(filePath)
  })

  ipcMain.handle(IPC.FS_WRITE_FILE, async (_e, filePath: string, content: string) => {
    return FileService.writeFile(filePath, content)
  })

  // ── App handlers ──
  ipcMain.handle(IPC.APP_SELECT_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Repository',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Accepts a path directly (for testing — avoids dialog.showOpenDialog)
  ipcMain.handle(IPC.APP_ADD_PROJECT_PATH, async (_e, dirPath: string) => {
    const { stat } = await import('fs/promises')
    try {
      const s = await stat(dirPath)
      if (!s.isDirectory()) return null
      return dirPath
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.APP_GET_DATA_PATH, async () => {
    return app.getPath('userData')
  })

  ipcMain.handle(IPC.APP_GET_PARLOUR_PATH, async () => {
    const parlourPath = join(app.getPath('home'), '.parlour')
    await mkdir(parlourPath, { recursive: true })
    return parlourPath
  })

  // ── Chat workspace handlers ──
  ipcMain.handle(IPC.CHAT_CREATE_DIR, async (_e, chatId: string, parentDirPath?: string) => {
    return createChatDir(chatId, parentDirPath)
  })

  ipcMain.handle(IPC.CHAT_REMOVE_DIR, async (_e, chatId: string) => {
    const chatDir = join(PARLOUR_DIR, 'chats', chatId)
    await rm(chatDir, { recursive: true, force: true })
  })

  ipcMain.handle(IPC.CHAT_WRITE_AGENTS_MD, async (_e, chatDir: string) => {
    await writeAgentsMd(chatDir)
  })

  ipcMain.handle(IPC.CHAT_GENERATE_TITLE, async (_e, prompt: string, llmCommand?: string) => {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const exec = promisify(execFile)
    const cmd = llmCommand ?? 'claude'
    try {
      const { stdout } = await exec(cmd, [
        '-p', `Give a 3-5 word title for this chat. No quotes, no punctuation, no prefix. Just the title words:\n\n${prompt}`,
        '--max-turns', '0',
      ], { timeout: 15000 })
      const title = stdout.trim()
        .replace(/^["'`\-–—*#•>\s]+/, '')
        .replace(/["'`\s]+$/, '')
        .replace(/\b\w/g, (c) => c.toUpperCase())
      return title || null
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.CHAT_SUMMARIZE_CONTEXT, async (_e, ptyId: string) => {
    const buffer = ptyManager.getBuffer(ptyId)
    const tail = buffer.length > 8000 ? buffer.slice(-8000) : buffer
    if (!tail.trim()) return null
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const exec = promisify(execFile)
    try {
      const { stdout } = await exec('claude', [
        '-p', `Summarize the following terminal session into a concise context paragraph for a sub-agent. Focus on: what task is being worked on, key decisions made, current state. No preamble.\n\n${tail}`,
        '--max-turns', '0',
      ], { timeout: 30000 })
      return stdout.trim() || null
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.CHAT_NOTIFY_PARENT, async (_e, parentPtyId: string, message: string) => {
    ptyManager.write(parentPtyId, `\r\n${message}\r\n`)
  })

  ipcMain.handle(IPC.CHAT_GET_SESSION_ID, async (_e, chatDir: string) => {
    return getClaudeSessionId(chatDir)
  })

  // ── Shell handlers ──
  ipcMain.handle(IPC.SHELL_RUN_COMMAND, async (_e, command: string, cwd: string) => {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const exec = promisify(execFile)
    try {
      const env = { ...process.env }
      delete env.CLAUDECODE
      const { stdout, stderr } = await exec('/bin/sh', ['-c', command], { cwd, timeout: 120000, env })
      return { success: true, output: stdout || stderr }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, output: msg }
    }
  })

  // ── Schedule handlers ──
  ipcMain.handle(IPC.SCHEDULE_LIST, async () => {
    return taskScheduler.list()
  })

  ipcMain.handle(IPC.SCHEDULE_CREATE, async (_e, opts: Parameters<TaskScheduler['create']>[0]) => {
    return taskScheduler.create(opts)
  })

  ipcMain.handle(IPC.SCHEDULE_DELETE, async (_e, id: string) => {
    taskScheduler.delete(id)
  })

  ipcMain.handle(IPC.SCHEDULE_TOGGLE, async (_e, id: string) => {
    taskScheduler.toggle(id)
  })

  ipcMain.handle(IPC.SCHEDULE_UPDATE, async (_e, id: string, partial: { name?: string; prompt?: string; project?: string; trigger?: { type: 'cron'; cron: string } | { type: 'once'; at: string }; llmCommand?: string }) => {
    taskScheduler.update(id, partial)
  })

  ipcMain.handle(IPC.SCHEDULE_RUN_NOW, async (_e, id: string) => {
    taskScheduler.runNow(id)
  })

  // ── Chat registry handlers ──
  ipcMain.handle(IPC.CHAT_REGISTRY_GET_STATE, async () => {
    return chatRegistry.getState()
  })

  ipcMain.handle(IPC.CHAT_REGISTRY_UPDATE, async (_e, id: string, partial: Record<string, unknown>) => {
    chatRegistry.updateChat(id, partial)
  })

  ipcMain.handle(IPC.CHAT_REGISTRY_CREATE, async (_e, opts: Parameters<ChatRegistry['createChat']>[0]) => {
    return chatRegistry.createChat(opts)
  })

  ipcMain.handle(IPC.CHAT_REGISTRY_CREATE_CHILD, async (_e, parentId: string, opts: Parameters<ChatRegistry['createChat']>[0]) => {
    return chatRegistry.createChildChat(parentId, opts)
  })

  ipcMain.handle(IPC.CHAT_REGISTRY_RESUME, async (_e, chatId: string) => {
    return chatRegistry.resumeChat(chatId)
  })

  ipcMain.handle(IPC.CHAT_REGISTRY_DELETE, async (_e, chatId: string) => {
    return chatRegistry.deleteChat(chatId)
  })

  ipcMain.handle(IPC.CHAT_REGISTRY_RETITLE, async (_e, chatId: string) => {
    return chatRegistry.retitleChat(chatId)
  })

  // ── CLI detection ──
  ipcMain.handle(IPC.CLI_DETECT, async () => {
    return detectInstalledClis()
  })

  ipcMain.handle(IPC.CLI_BASE_DEFAULTS, () => {
    return getCliBaseDefaults()
  })

  // ── State persistence handlers ──
  const stateFilePath = () =>
    join(app.getPath('userData'), 'parlour-state.json')

  // ── Opener discovery ──

  const KNOWN_OPENERS = [
    { id: 'finder', name: 'Finder', cmd: 'open' },
    { id: 'terminal', name: 'Terminal', cmd: 'open', args: ['-a', 'Terminal'] },
    { id: 'iterm', name: 'iTerm', app: 'iTerm.app' },
    { id: 'warp', name: 'Warp', app: 'Warp.app' },
    { id: 'ghostty', name: 'Ghostty', app: 'Ghostty.app' },
    { id: 'vscode', name: 'VS Code', cli: 'code' },
    { id: 'cursor', name: 'Cursor', cli: 'cursor' },
    { id: 'zed', name: 'Zed', cli: 'zed' },
    { id: 'sublime', name: 'Sublime Text', cli: 'subl' },
    { id: 'webstorm', name: 'WebStorm', cli: 'webstorm' },
    { id: 'idea', name: 'IntelliJ IDEA', cli: 'idea' },
    { id: 'nova', name: 'Nova', cli: 'nova' },
  ] as const

  let cachedOpeners: Array<{ id: string; name: string }> | null = null

  ipcMain.handle(IPC.APP_DISCOVER_OPENERS, async () => {
    if (cachedOpeners) return cachedOpeners
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const { access } = await import('fs/promises')
    const exec = promisify(execFile)

    const results: Array<{ id: string; name: string }> = []
    for (const opener of KNOWN_OPENERS) {
      if (opener.id === 'finder' || opener.id === 'terminal') {
        results.push({ id: opener.id, name: opener.name })
        continue
      }
      if ('cli' in opener) {
        try {
          await exec('which', [opener.cli])
          results.push({ id: opener.id, name: opener.name })
        } catch { /* not installed */ }
      }
      if ('app' in opener) {
        try {
          await access(`/Applications/${opener.app}`)
          results.push({ id: opener.id, name: opener.name })
        } catch { /* not installed */ }
      }
    }
    cachedOpeners = results
    return results
  })

  ipcMain.handle(IPC.APP_OPEN_IN, async (_e, openerId: string, dirPath: string) => {
    const { execFile } = await import('child_process')
    const opener = KNOWN_OPENERS.find((o) => o.id === openerId)
    if (!opener) return

    if (opener.id === 'finder') {
      execFile('open', [dirPath])
    } else if ('args' in opener) {
      execFile('open', [...opener.args, dirPath])
    } else if ('cli' in opener) {
      execFile(opener.cli, [dirPath])
    } else if ('app' in opener) {
      execFile('open', ['-a', opener.app, dirPath])
    }
  })

  ipcMain.handle(IPC.STATE_SAVE, async (_e, data: unknown) => {
    await saveJsonFile(stateFilePath(), data)
  })

  ipcMain.handle(IPC.STATE_LOAD, async () => {
    return loadJsonFile(stateFilePath(), null)
  })
}
