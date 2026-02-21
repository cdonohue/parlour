import { useEffect, useMemo, useCallback } from 'react'
import { Allotment } from 'allotment'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import 'allotment/dist/style.css'
import { useAppStore } from './store/app-store'
import { resolveLlmCommand } from './store/types'
import { usePlatform } from '@parlour/platform'
import { HeaderBar, NewChatDialog, Button } from '@parlour/ui'
import type { NewChatConfig } from '@parlour/ui'
import {
  Sidebar,
  TerminalPanel,
  SettingsPanel,
  TasksPanel,
  ToastContainer,
} from './connected'
import { useShortcuts } from './hooks/useShortcuts'
import styles from './App.module.css'

export function App() {
  useShortcuts()
  const platform = usePlatform()

  const activeChatId = useAppStore((s) => s.activeChatId)
  const contentView = useAppStore((s) => s.contentView)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const newChatDialog = useAppStore((s) => s.newChatDialog)
  const chats = useAppStore((s) => s.chats)
  const settings = useAppStore((s) => s.settings)
  const setActiveChat = useAppStore((s) => s.setActiveChat)
  const closeNewChatDialog = useAppStore((s) => s.closeNewChatDialog)
  const createNewChat = useAppStore((s) => s.createNewChat)
  const createChildChat = useAppStore((s) => s.createChildChat)
  const resumeChat = useAppStore((s) => s.resumeChat)

  const chat = chats.find((c) => c.id === activeChatId)

  const openInEditor = useCallback(async (path: string) => {
    const s = useAppStore.getState()
    let opener = s.settings.lastOpenIn
    if (!opener) {
      const openers = await platform.app.discoverOpeners()
      if (openers.length > 0) {
        opener = openers[0].id
        s.updateSettings({ lastOpenIn: opener })
      }
    }
    if (opener) platform.app.openIn(opener, path)
  }, [platform])

  useEffect(() => {
    if (chat && !chat.ptyId && chat.dirPath) resumeChat(chat.id)
  }, [chat?.id])

  const chatBreadcrumbs = useMemo(() => {
    if (!chat?.parentId) return undefined
    const crumbs: { label: string; onClick?: () => void }[] = []
    let current = chats.find((c) => c.id === chat.parentId)
    while (current) {
      const id = current.id
      crumbs.unshift({ label: current.name, onClick: () => setActiveChat(id) })
      current = current.parentId ? chats.find((c) => c.id === current!.parentId) : undefined
    }
    return crumbs
  }, [chat?.parentId, chats, setActiveChat])

  const handleNewChat = useCallback(async (config: NewChatConfig) => {
    const dialog = useAppStore.getState().newChatDialog
    closeNewChatDialog()

    if (dialog?.mode === 'child') {
      await createChildChat(dialog.parentId, { llmCommand: config.llmCommand })
    } else {
      await createNewChat({ llmCommand: config.llmCommand })
    }
  }, [closeNewChatDialog, createNewChat, createChildChat])

  return (
    <HotkeysProvider>
    <div className={styles.app}>
      <div className={styles.layout}>
        <Allotment separator={false}>
          {!sidebarCollapsed && (
            <Allotment.Pane minSize={160} maxSize={400} preferredSize={260}>
              <Sidebar />
            </Allotment.Pane>
          )}

          <Allotment.Pane>
            <div className={styles.paneContent}>
              {/* Tasks layer */}
              <div className={`${styles.paneLayer} ${contentView === 'tasks' ? styles.paneLayerActive : styles.paneLayerInactive}`}>
                <TasksPanel />
              </div>

              {/* Chat terminal layer */}
              <div className={`${styles.paneLayer} ${styles.chatLayer} ${contentView === 'chat' ? styles.paneLayerActive : styles.paneLayerInactive}`}>
                {contentView === 'chat' && chat?.ptyId ? (
                  <>
                    <HeaderBar
                      title={chat.name}
                      subtitle={resolveLlmCommand(settings, chat.llmCommand)}
                      breadcrumbs={chatBreadcrumbs}
                      projects={chat.projects}
                      onOpenUrl={(url) => window.open(url)}
                      onOpen={openInEditor}
                    />
                    <div className={styles.chatTerminalWrapper}>
                      <TerminalPanel key={chat.id} ptyId={chat.ptyId} active={true} />
                    </div>
                  </>
                ) : contentView === 'chat' && chat?.dirPath ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>
                      {chat.status === 'error' ? 'Session ended with error' : 'Session ended'}
                    </div>
                    <div className={styles.emptyActions}>
                      <Button variant="ghost" size="sm" onClick={() => resumeChat(chat.id)}>Resume</Button>
                      <span className={styles.emptyHint}><kbd className={styles.kbd}>&#8984;N</kbd> New chat</span>
                    </div>
                  </div>
                ) : contentView === 'chat' ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>No active chat</div>
                    <div className={styles.emptyActions}>
                      <span className={styles.emptyHint}><kbd className={styles.kbd}>&#8984;N</kbd> New chat</span>
                    </div>
                  </div>
                ) : null}
              </div>

            </div>
          </Allotment.Pane>

        </Allotment>
      </div>
      {settingsOpen && <SettingsPanel />}
      {newChatDialog && (
        <NewChatDialog
          defaultLlmCommand={newChatDialog.mode === 'child'
            ? (chats.find((c) => c.id === newChatDialog.parentId)?.llmCommand || settings.llmCommand)
            : settings.llmCommand}
          onConfirm={handleNewChat}
          onCancel={closeNewChatDialog}
        />
      )}
      <ToastContainer />
    </div>
    </HotkeysProvider>
  )
}
