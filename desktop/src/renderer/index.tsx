import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PlatformProvider } from '@parlour/platform'
import { App } from './App'
import { useAppStore, hydrateFromDisk } from './store/app-store'
import './styles/global.css'

const adapter = window.api

// Expose store for e2e testing
;(window as any).__store = useAppStore

function applyThemeAttribute(resolved: 'dark' | 'light'): void {
  document.documentElement.setAttribute('data-theme', resolved === 'light' ? 'light' : '')
}

const initialTheme = useAppStore.getState().settings.theme
if (initialTheme === 'light') {
  applyThemeAttribute('light')
}

adapter.theme.onResolvedChanged(applyThemeAttribute)

hydrateFromDisk()

const root = createRoot(document.getElementById('root')!)
root.render(
  <StrictMode>
    <PlatformProvider value={adapter}>
      <App />
    </PlatformProvider>
  </StrictMode>
)
