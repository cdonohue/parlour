import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createWebSocketAdapter, PlatformProvider } from '@chorale/platform'
import { App, initApp, hydrateFromDisk } from '@chorale/app'
import './global.css'

const params = new URLSearchParams(window.location.search)
const port = params.get('port') ?? '3000'
const serverUrl = `http://localhost:${port}`

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

const adapter = createWebSocketAdapter(serverUrl)

adapter.theme.setMode = (mode) =>
  fetch(`${serverUrl}/api/theme/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  }).then(() => undefined)

adapter.theme.onResolvedChanged = (cb) => {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).__store = store

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlatformProvider value={adapter}>
      <App />
    </PlatformProvider>
  </StrictMode>,
)
