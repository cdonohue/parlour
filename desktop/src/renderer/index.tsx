import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useAppStore, hydrateFromDisk } from './store/app-store'
import './styles/global.css'

// Expose store for e2e testing
;(window as any).__store = useAppStore

// Load persisted state before rendering
hydrateFromDisk()

const root = createRoot(document.getElementById('root')!)
root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
