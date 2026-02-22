import { useEffect } from 'react'
import { useHotkey } from '@tanstack/react-hotkeys'
import { usePlatform } from '@chorale/platform'
import { useAppStore } from '../store/app-store'
import type { Keybindings } from '@chorale/ui'

function useKeybindings(): Keybindings {
  return useAppStore((s) => s.settings.keybindings)
}

function switchToChat(index: number) {
  const s = useAppStore.getState()
  const rootChats = s.chats.filter((c) => !c.parentId)
  const pinned = rootChats.filter((c) => c.pinnedAt != null).sort((a, b) => a.pinnedAt! - b.pinnedAt!)
  const unpinned = rootChats.filter((c) => c.pinnedAt == null).sort((a, b) => b.lastActiveAt - a.lastActiveAt)
  const target = [...pinned, ...unpinned][index]
  if (target) s.navigateToChat(target.id)
}

function useChatSwitchHotkeys() {
  useHotkey('Mod+1', () => switchToChat(0))
  useHotkey('Mod+2', () => switchToChat(1))
  useHotkey('Mod+3', () => switchToChat(2))
  useHotkey('Mod+4', () => switchToChat(3))
  useHotkey('Mod+5', () => switchToChat(4))
  useHotkey('Mod+6', () => switchToChat(5))
  useHotkey('Mod+7', () => switchToChat(6))
  useHotkey('Mod+8', () => switchToChat(7))
  useHotkey('Mod+9', () => switchToChat(8))
}

export function useShortcuts() {
  const platform = usePlatform()
  const kb = useKeybindings()

  const hk = (action: keyof Keybindings) => kb[action] as Parameters<typeof useHotkey>[0]

  useHotkey(hk('toggle-sidebar'), () => {
    useAppStore.getState().toggleSidebar()
  })

  useHotkey(hk('new-chat'), () => {
    useAppStore.getState().createNewChat()
  })

  useHotkey(hk('new-child-chat'), () => {
    useAppStore.getState().openNewChatDialog({ mode: 'new' })
  })

  useHotkey(hk('open-in-editor'), async () => {
    const s = useAppStore.getState()
    const chat = s.chats.find((c) => c.id === s.activeChatId)
    if (!chat?.dirPath) return
    let opener = s.settings.lastOpenIn
    if (!opener) {
      const openers = await platform.app.discoverOpeners()
      if (openers.length > 0) {
        opener = openers[0].id
        s.updateSettings({ lastOpenIn: opener })
      }
    }
    if (opener) platform.app.openIn(opener, chat.dirPath)
  })

  useHotkey(hk('settings'), () => {
    useAppStore.getState().toggleSettings()
  })

  useHotkey(hk('font-increase'), () => {
    const s = useAppStore.getState()
    const next = Math.max(8, Math.min(32, s.settings.terminalFontSize + 1))
    s.updateSettings({ terminalFontSize: next })
  })

  useHotkey(hk('font-decrease'), () => {
    const s = useAppStore.getState()
    const next = Math.max(8, Math.min(32, s.settings.terminalFontSize - 1))
    s.updateSettings({ terminalFontSize: next })
  })

  useHotkey(hk('font-reset'), () => {
    useAppStore.getState().updateSettings({ terminalFontSize: 14 })
  })

  useChatSwitchHotkeys()

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
          platform.pty.write(chat.ptyId, '\x1b[Z')
        }
      } else {
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [platform])
}
