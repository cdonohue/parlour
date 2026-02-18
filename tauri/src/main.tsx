import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createWebSocketAdapter, PlatformProvider } from '@parlour/platform'
import { App, initApp, hydrateFromDisk } from '@parlour/app'
import { invoke } from '@tauri-apps/api/core'
import { open as dialogOpen } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import './global.css'

const port = await invoke<number>('get_server_port')
const serverUrl = `http://localhost:${port}`

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

const adapter = createWebSocketAdapter(serverUrl)

adapter.app.selectDirectory = async () => {
  const path = await dialogOpen({ directory: true })
  return path ?? null
}

adapter.shell.openExternal = (url: string) => openUrl(url)

adapter.theme.setMode = (mode: string) =>
  fetch(`${serverUrl}/api/theme/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  }).then(() => undefined)

adapter.theme.onResolvedChanged = (cb: (resolved: 'dark' | 'light') => void) => {
  const handler = (e: MediaQueryListEvent) => cb(e.matches ? 'dark' : 'light')
  mediaQuery.addEventListener('change', handler)
  cb(mediaQuery.matches ? 'dark' : 'light')
  return () => mediaQuery.removeEventListener('change', handler)
}

const store = initApp(adapter)

function applyTheme(resolved: 'dark' | 'light'): void {
  document.documentElement.setAttribute('data-theme', resolved === 'light' ? 'light' : '')
}

adapter.theme.onResolvedChanged(applyTheme)
hydrateFromDisk(adapter, store)

;(window as unknown as Record<string, unknown>).__store = store

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlatformProvider value={adapter}>
      <App />
    </PlatformProvider>
  </StrictMode>,
)
