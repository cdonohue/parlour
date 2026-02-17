import { useCallback } from 'react'
import { Sidebar as SidebarUI } from '@parlour/ui'
import { useAppStore } from '../store/app-store'
import { resolveLlmCommand } from '../store/types'
import { useSchedules } from '../hooks/useSchedules'

export function Sidebar() {
  const {
    chats,
    activeChatId,
    contentView,
    unreadChatIds,
    settings,
    navigateToChat,
    deleteChat,
    retitleChat,
    pinChat,
    unpinChat,
    createNewChat,
    createChildChat,
    toggleSettings,
    toggleTasks,
    openNewChatDialog,
  } = useAppStore()

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
