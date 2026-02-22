import { useEffect } from 'react'
import { usePlatform } from '@chorale/platform'
import { useAppStore } from '../store/app-store'

export function useNotifications(): void {
  const platform = usePlatform()

  useEffect(() => {
    return platform.notifications.onNotification(({ chatId, chatName, status }) => {
      if (status !== 'waiting') return

      const { activeChatId, markChatUnread } = useAppStore.getState()
      const isFocused = activeChatId === chatId && document.hasFocus()
      markChatUnread(chatId)

      if (isFocused) return
      if (typeof Notification === 'undefined') return

      if (Notification.permission === 'default') {
        Notification.requestPermission()
        return
      }
      if (Notification.permission !== 'granted') return

      const n = new Notification('Agent waiting', { body: chatName, tag: chatId })
      n.onclick = () => {
        useAppStore.getState().setActiveChat(chatId)
        window.focus()
        n.close()
      }
    })
  }, [platform])
}
