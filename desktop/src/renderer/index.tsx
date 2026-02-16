import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useAppStore, hydrateFromDisk } from './store/app-store'
import './styles/global.css'

// Expose store for e2e testing
;(window as any).__store = useAppStore

function applyThemeAttribute(resolved: 'dark' | 'light'): void {
  document.documentElement.setAttribute('data-theme', resolved === 'light' ? 'light' : '')
}

// Apply initial theme from persisted settings before first paint
const initialTheme = useAppStore.getState().settings.theme
if (initialTheme === 'light') {
  applyThemeAttribute('light')
}

// Subscribe to resolved theme changes from main process
window.api.theme.onResolvedChanged(applyThemeAttribute)

// Load persisted state before rendering
hydrateFromDisk()

const root = createRoot(document.getElementById('root')!)
root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
