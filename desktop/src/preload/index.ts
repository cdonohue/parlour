import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

const api = {
  git: {
    getStatus: (repoPath: string) =>
      ipcRenderer.invoke(IPC.GIT_GET_STATUS, repoPath),
    getDiff: (repoPath: string, staged: boolean) =>
      ipcRenderer.invoke(IPC.GIT_GET_DIFF, repoPath, staged),
    getFileDiff: (repoPath: string, filePath: string) =>
      ipcRenderer.invoke(IPC.GIT_GET_FILE_DIFF, repoPath, filePath),
    getBranches: (repoPath: string) =>
      ipcRenderer.invoke(IPC.GIT_GET_BRANCHES, repoPath),
    stage: (repoPath: string, paths: string[]) =>
      ipcRenderer.invoke(IPC.GIT_STAGE, repoPath, paths),
    unstage: (repoPath: string, paths: string[]) =>
      ipcRenderer.invoke(IPC.GIT_UNSTAGE, repoPath, paths),
    discard: (repoPath: string, paths: string[], untracked: string[]) =>
      ipcRenderer.invoke(IPC.GIT_DISCARD, repoPath, paths, untracked),
    commit: (repoPath: string, message: string) =>
      ipcRenderer.invoke(IPC.GIT_COMMIT, repoPath, message),
    getCurrentBranch: (repoPath: string) =>
      ipcRenderer.invoke(IPC.GIT_GET_CURRENT_BRANCH, repoPath) as Promise<string>,
    isGitRepo: (dirPath: string) =>
      ipcRenderer.invoke(IPC.GIT_IS_REPO, dirPath) as Promise<boolean>,
    cloneBare: (url: string, targetDir: string) =>
      ipcRenderer.invoke(IPC.GIT_CLONE_BARE, url, targetDir) as Promise<string>,
    getParentBranch: (repoPath: string, branch: string) =>
      ipcRenderer.invoke(IPC.GIT_GET_PARENT_BRANCH, repoPath, branch) as Promise<string>,
  },

  pty: {
    create: (workingDir: string, shell?: string, extraEnv?: Record<string, string>, command?: string[]) =>
      ipcRenderer.invoke(IPC.PTY_CREATE, workingDir, shell, extraEnv, command),
    write: (ptyId: string, data: string) =>
      ipcRenderer.send(IPC.PTY_WRITE, ptyId, data),
    resize: (ptyId: string, cols: number, rows: number) =>
      ipcRenderer.send(IPC.PTY_RESIZE, ptyId, cols, rows),
    destroy: (ptyId: string) =>
      ipcRenderer.send(IPC.PTY_DESTROY, ptyId),
    list: () =>
      ipcRenderer.invoke(IPC.PTY_LIST) as Promise<string[]>,
    reattach: (ptyId: string) =>
      ipcRenderer.invoke(IPC.PTY_REATTACH, ptyId) as Promise<boolean>,
    getBuffer: (ptyId: string) =>
      ipcRenderer.invoke(IPC.PTY_GET_BUFFER, ptyId) as Promise<string>,
    onData: (ptyId: string, callback: (data: string) => void) => {
      const channel = `${IPC.PTY_DATA}:${ptyId}`
      const listener = (_event: Electron.IpcRendererEvent, data: string) => callback(data)
      ipcRenderer.on(channel, listener)
      return () => {
        ipcRenderer.removeListener(channel, listener)
      }
    },
    onTitle: (ptyId: string, callback: (title: string) => void) => {
      const channel = `${IPC.PTY_TITLE}:${ptyId}`
      const listener = (_event: Electron.IpcRendererEvent, title: string) => callback(title)
      ipcRenderer.on(channel, listener)
      return () => {
        ipcRenderer.removeListener(channel, listener)
      }
    },
    onFirstInput: (ptyId: string, callback: (input: string) => void) => {
      const channel = `${IPC.PTY_FIRST_INPUT}:${ptyId}`
      const listener = (_event: Electron.IpcRendererEvent, input: string) => callback(input)
      ipcRenderer.on(channel, listener)
      return () => {
        ipcRenderer.removeListener(channel, listener)
      }
    },
    onExit: (ptyId: string, callback: (exitCode: number) => void) => {
      const channel = `${IPC.PTY_EXIT}:${ptyId}`
      const listener = (_event: Electron.IpcRendererEvent, exitCode: number) => callback(exitCode)
      ipcRenderer.on(channel, listener)
      return () => {
        ipcRenderer.removeListener(channel, listener)
      }
    },
  },

  fs: {
    readFile: (filePath: string) =>
      ipcRenderer.invoke(IPC.FS_READ_FILE, filePath),
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke(IPC.FS_WRITE_FILE, filePath, content),
  },

  app: {
    selectDirectory: () =>
      ipcRenderer.invoke(IPC.APP_SELECT_DIRECTORY),
    addProjectPath: (dirPath: string) =>
      ipcRenderer.invoke(IPC.APP_ADD_PROJECT_PATH, dirPath),
    getDataPath: () =>
      ipcRenderer.invoke(IPC.APP_GET_DATA_PATH),
    getParlourPath: () =>
      ipcRenderer.invoke(IPC.APP_GET_PARLOUR_PATH) as Promise<string>,
    discoverOpeners: () =>
      ipcRenderer.invoke(IPC.APP_DISCOVER_OPENERS) as Promise<Array<{ id: string; name: string }>>,
    openIn: (openerId: string, dirPath: string) =>
      ipcRenderer.invoke(IPC.APP_OPEN_IN, openerId, dirPath),
  },

  chat: {
    createDir: (chatId: string, parentDirPath?: string) =>
      ipcRenderer.invoke(IPC.CHAT_CREATE_DIR, chatId, parentDirPath) as Promise<string>,
    removeDir: (chatId: string) =>
      ipcRenderer.invoke(IPC.CHAT_REMOVE_DIR, chatId),
    writeAgentsMd: (chatDir: string) =>
      ipcRenderer.invoke(IPC.CHAT_WRITE_AGENTS_MD, chatDir),
    generateTitle: (prompt: string, llmCommand?: string) =>
      ipcRenderer.invoke(IPC.CHAT_GENERATE_TITLE, prompt, llmCommand) as Promise<string | null>,
    summarizeContext: (ptyId: string) =>
      ipcRenderer.invoke(IPC.CHAT_SUMMARIZE_CONTEXT, ptyId) as Promise<string | null>,
    notifyParent: (parentPtyId: string, message: string) =>
      ipcRenderer.invoke(IPC.CHAT_NOTIFY_PARENT, parentPtyId, message),
    getSessionId: (chatDir: string) =>
      ipcRenderer.invoke(IPC.CHAT_GET_SESSION_ID, chatDir) as Promise<string | null>,
  },

  schedules: {
    list: () =>
      ipcRenderer.invoke(IPC.SCHEDULE_LIST),
    create: (opts: unknown) =>
      ipcRenderer.invoke(IPC.SCHEDULE_CREATE, opts),
    delete: (id: string) =>
      ipcRenderer.invoke(IPC.SCHEDULE_DELETE, id),
    toggle: (id: string) =>
      ipcRenderer.invoke(IPC.SCHEDULE_TOGGLE, id),
    update: (id: string, partial: { name?: string; prompt?: string; project?: string; trigger?: { type: 'cron'; cron: string } | { type: 'once'; at: string } }) =>
      ipcRenderer.invoke(IPC.SCHEDULE_UPDATE, id, partial),
    runNow: (id: string) =>
      ipcRenderer.invoke(IPC.SCHEDULE_RUN_NOW, id),
    onChanged: (callback: (schedules: unknown[]) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, schedules: unknown[]) => callback(schedules)
      ipcRenderer.on(IPC.SCHEDULE_CHANGED, listener)
      return () => { ipcRenderer.removeListener(IPC.SCHEDULE_CHANGED, listener) }
    },
  },

  github: {
    getPrStatuses: (repoPath: string, branches: string[]) =>
      ipcRenderer.invoke(IPC.GITHUB_GET_PR_STATUSES, repoPath, branches),
  },

  shell: {
    runCommand: (command: string, cwd: string) =>
      ipcRenderer.invoke(IPC.SHELL_RUN_COMMAND, command, cwd) as Promise<{ success: boolean; output: string }>,
    openExternal: (url: string) =>
      ipcRenderer.invoke(IPC.SHELL_OPEN_EXTERNAL, url),
  },

  mcp: {
    getPort: () =>
      ipcRenderer.invoke(IPC.MCP_GET_PORT) as Promise<number>,
  },

  chatRegistry: {
    getState: () =>
      ipcRenderer.invoke(IPC.CHAT_REGISTRY_GET_STATE),
    onStateChanged: (callback: (state: { chats: unknown[] }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: { chats: unknown[] }) => callback(state)
      ipcRenderer.on(IPC.CHAT_REGISTRY_STATE_CHANGED, listener)
      return () => { ipcRenderer.removeListener(IPC.CHAT_REGISTRY_STATE_CHANGED, listener) }
    },
    update: (id: string, partial: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC.CHAT_REGISTRY_UPDATE, id, partial),
    create: (opts: unknown) =>
      ipcRenderer.invoke(IPC.CHAT_REGISTRY_CREATE, opts),
    createChild: (parentId: string, opts: unknown) =>
      ipcRenderer.invoke(IPC.CHAT_REGISTRY_CREATE_CHILD, parentId, opts),
    resume: (chatId: string) =>
      ipcRenderer.invoke(IPC.CHAT_REGISTRY_RESUME, chatId),
    delete: (chatId: string) =>
      ipcRenderer.invoke(IPC.CHAT_REGISTRY_DELETE, chatId),
    retitle: (chatId: string) =>
      ipcRenderer.invoke(IPC.CHAT_REGISTRY_RETITLE, chatId),
  },

  cli: {
    detect: () =>
      ipcRenderer.invoke(IPC.CLI_DETECT) as Promise<string[]>,
    baseDefaults: () =>
      ipcRenderer.invoke(IPC.CLI_BASE_DEFAULTS) as Promise<Record<string, string>>,
  },

  theme: {
    setMode: (mode: string) =>
      ipcRenderer.invoke(IPC.THEME_SET_MODE, mode),
    onResolvedChanged: (callback: (resolved: 'dark' | 'light') => void) => {
      const listener = (_event: Electron.IpcRendererEvent, resolved: 'dark' | 'light') => callback(resolved)
      ipcRenderer.on(IPC.THEME_RESOLVED_CHANGED, listener)
      return () => { ipcRenderer.removeListener(IPC.THEME_RESOLVED_CHANGED, listener) }
    },
  },

  state: {
    save: (data: unknown) =>
      ipcRenderer.invoke(IPC.STATE_SAVE, data),
    load: () =>
      ipcRenderer.invoke(IPC.STATE_LOAD),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
