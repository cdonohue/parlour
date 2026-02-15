import { useEffect } from 'react'
import { useHotkey } from '@tanstack/react-hotkeys'
import { useAppStore } from '../store/app-store'
import type { Keybindings } from '@parlour/ui'

function useKeybindings(): Keybindings {
  return useAppStore((s) => s.settings.keybindings)
}

export function useShortcuts() {
  const kb = useKeybindings()

  useHotkey(kb['toggle-sidebar'], () => {
    useAppStore.getState().toggleSidebar()
  })

  useHotkey(kb['new-chat'], () => {
    useAppStore.getState().createNewChat()
  })

  useHotkey(kb['new-child-chat'], () => {
    useAppStore.getState().openNewChatDialog({ mode: 'new' })
  })

  useHotkey(kb['open-in-editor'], async () => {
    const s = useAppStore.getState()
    const chat = s.chats.find((c) => c.id === s.activeChatId)
    if (!chat?.dirPath) return
    let opener = s.settings.lastOpenIn
    if (!opener) {
      const openers = await window.api.app.discoverOpeners()
      if (openers.length > 0) {
        opener = openers[0].id
        s.updateSettings({ lastOpenIn: opener })
      }
    }
    if (opener) window.api.app.openIn(opener, chat.dirPath)
  })

  useHotkey(kb['settings'], () => {
    useAppStore.getState().toggleSettings()
  })

  useHotkey(kb['font-increase'], () => {
    const s = useAppStore.getState()
    const next = Math.max(8, Math.min(32, s.settings.terminalFontSize + 1))
    s.updateSettings({ terminalFontSize: next })
  })

  useHotkey(kb['font-decrease'], () => {
    const s = useAppStore.getState()
    const next = Math.max(8, Math.min(32, s.settings.terminalFontSize - 1))
    s.updateSettings({ terminalFontSize: next })
  })

  useHotkey(kb['font-reset'], () => {
    useAppStore.getState().updateSettings({ terminalFontSize: 14 })
  })

  // Tab/Shift+Tab: non-configurable, capture-phase for xterm
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      if (!(e.target as HTMLElement)?.closest?.('[class*="terminalInner"]')) return

      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        const s = useAppStore.getState()
        const chat = s.chats.find((c) => c.id === s.activeChatId)
        if (chat?.ptyId) {
          window.api.pty.write(chat.ptyId, '\x1b[Z')
        }
      } else {
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])
}
