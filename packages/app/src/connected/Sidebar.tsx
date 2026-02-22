import { useCallback } from 'react'
import { Sidebar as SidebarUI } from '@parlour/ui'
import { useAppStore } from '../store/app-store'
import { resolveLlmCommand } from '../store/types'
import { useSchedules } from '../hooks/useSchedules'

export function Sidebar() {
  const chats = useAppStore((s) => s.chats)
  const activeChatId = useAppStore((s) => s.activeChatId)
  const contentView = useAppStore((s) => s.contentView)
  const unreadChatIds = useAppStore((s) => s.unreadChatIds)
  const settings = useAppStore((s) => s.settings)
  const navigateToChat = useAppStore((s) => s.navigateToChat)
  const deleteChat = useAppStore((s) => s.deleteChat)
  const retitleChat = useAppStore((s) => s.retitleChat)
  const pinChat = useAppStore((s) => s.pinChat)
  const unpinChat = useAppStore((s) => s.unpinChat)
  const createNewChat = useAppStore((s) => s.createNewChat)
  const createChildChat = useAppStore((s) => s.createChildChat)
  const toggleSettings = useAppStore((s) => s.toggleSettings)
  const toggleTasks = useAppStore((s) => s.toggleTasks)
  const openNewChatDialog = useAppStore((s) => s.openNewChatDialog)

  const schedules = useSchedules()

  const handleNewChat = useCallback((opts?: { withDialog?: boolean }) => {
    if (opts?.withDialog) {
      openNewChatDialog({ mode: 'new' })
    } else {
      createNewChat()
    }
  }, [createNewChat, openNewChatDialog])

  const handleNewChildChat = useCallback((parentId: string, opts?: { withDialog?: boolean }) => {
    if (opts?.withDialog) {
      openNewChatDialog({ mode: 'child', parentId })
    } else {
      createChildChat(parentId)
    }
  }, [createChildChat, openNewChatDialog])

  return (
    <SidebarUI
      chats={chats}
      activeChatId={contentView === 'chat' ? activeChatId : null}
      unreadChatIds={unreadChatIds}
      onSelectChat={navigateToChat}
      onNewChat={handleNewChat}
      onNewChildChat={handleNewChildChat}
      onDeleteChat={(id) => deleteChat(id)}
      onRetitleChat={retitleChat}
      onPinChat={pinChat}
      onUnpinChat={unpinChat}
      onToggleSettings={toggleSettings}
      onToggleTasks={toggleTasks}
      maxChatDepth={settings.maxChatDepth}
      keybindings={settings.keybindings}
      defaultLlmCommand={resolveLlmCommand(settings)}
      schedules={schedules}
    />
  )
}
