import { contextBridge, ipcRenderer } from 'electron'
import { createWebSocketAdapter } from '@parlour/platform'
import { IPC } from '../shared/ipc-channels'

const serverUrl = ipcRenderer.sendSync(IPC.SERVER_GET_URL) as string
const adapter = createWebSocketAdapter(serverUrl)

adapter.app.selectDirectory = () => ipcRenderer.invoke(IPC.APP_SELECT_DIRECTORY)

adapter.shell.openExternal = (url: string) => ipcRenderer.invoke(IPC.SHELL_OPEN_EXTERNAL, url)

adapter.theme.setMode = (mode: string) => ipcRenderer.invoke(IPC.THEME_SET_MODE, mode)

adapter.theme.onResolvedChanged = (cb: (resolved: 'dark' | 'light') => void) => {
  const listener = (_event: Electron.IpcRendererEvent, resolved: 'dark' | 'light') => cb(resolved)
  ipcRenderer.on(IPC.THEME_RESOLVED_CHANGED, listener)
  return () => ipcRenderer.removeListener(IPC.THEME_RESOLVED_CHANGED, listener)
}

contextBridge.exposeInMainWorld('api', adapter)
