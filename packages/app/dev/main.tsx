import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createMockAdapter } from '@parlour/platform/testing/mock-adapter'
import { PlatformProvider } from '@parlour/platform'
import { App, initApp, hydrateFromDisk } from '@parlour/app'
import { SEED_CHATS } from './seed'
import './global.css'

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

const adapter = createMockAdapter({
  chatRegistry: {
    getState: () => Promise.resolve({ chats: SEED_CHATS }),
    onStateChanged: () => () => {},
    update: () => Promise.resolve(undefined),
    create: () => Promise.resolve({ chat: { id: crypto.randomUUID(), name: 'New Chat' } }),
    createChild: () => Promise.resolve({ chat: { id: crypto.randomUUID(), name: 'Child Chat' } }),
    resume: () => Promise.resolve({}),
    delete: () => Promise.resolve(undefined),
    retitle: () => Promise.resolve(undefined),
  },
  theme: {
    setMode: () => Promise.resolve(undefined),
    onResolvedChanged: (cb) => {
      const handler = (e: MediaQueryListEvent) => cb(e.matches ? 'dark' : 'light')
      mediaQuery.addEventListener('change', handler)
      cb(mediaQuery.matches ? 'dark' : 'light')
      return () => mediaQuery.removeEventListener('change', handler)
    },
  },
  cli: {
    detect: () => Promise.resolve(['claude']),
    baseDefaults: () => Promise.resolve({ claude: 'claude' }),
  },
})

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
  </StrictMode>
)
