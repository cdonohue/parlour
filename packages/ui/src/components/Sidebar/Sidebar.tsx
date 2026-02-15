import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { Settings, Plus, Pin, PinOff, ListTodo, Wand2 } from 'lucide-react'
import type { Chat, Schedule, ConfirmDialogState, Keybindings } from '../../types'
import { formatHotkey } from '../../utils/format-hotkey'
import { HStack, VStack } from '../../primitives/Stack/Stack'
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog'
import { SidebarAction } from '../SidebarAction/SidebarAction'
import { ChatItem } from '../ChatItem/ChatItem'
import styles from './Sidebar.module.css'

interface SidebarProps {
  chats: Chat[]
  activeChatId: string | null
  unreadChatIds: Set<string>
  onSelectChat: (id: string) => void
  onNewChat: (opts?: { withDialog?: boolean }) => void
  onNewChildChat?: (parentId: string, opts?: { withDialog?: boolean }) => void
  onDeleteChat: (chatId: string) => void
  onPinChat: (chatId: string) => void
  onUnpinChat: (chatId: string) => void
  onToggleSettings: () => void
  onToggleTasks: () => void
  maxChatDepth?: number
  schedules?: Schedule[]
  onSelectSchedule?: (id: string) => void
  onDeleteSchedule?: (id: string) => void
  onRetitleChat?: (chatId: string) => void
  onToggleSchedule?: (id: string) => void
  keybindings?: Partial<Pick<Keybindings, 'new-chat'>>
  defaultLlmCommand?: string
}

export function Sidebar({
  chats,
  activeChatId,
  unreadChatIds,
  onSelectChat,
  onNewChat,
  onNewChildChat,
  onDeleteChat,
  onPinChat,
  onUnpinChat,
  onToggleSettings,
  onToggleTasks,
  maxChatDepth = 2,
  schedules = [],
  onSelectSchedule,
  onRetitleChat,
  onDeleteSchedule,
  onToggleSchedule,
  keybindings,
  defaultLlmCommand = 'claude',
}: SidebarProps) {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [menuState, setMenuState] = useState<{ chatId: string; x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const openMenu = useCallback((chatId: string, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect()
    setMenuState({ chatId, x: rect.right, y: rect.bottom + 4 })
  }, [])

  const closeMenu = useCallback(() => setMenuState(null), [])

  useEffect(() => {
    if (!menuState) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuState, closeMenu])

  const rootChats = useMemo(() => chats.filter((c) => !c.parentId), [chats])
  const pinned = useMemo(() => rootChats.filter((c) => c.pinnedAt != null).sort((a, b) => a.pinnedAt! - b.pinnedAt!), [rootChats])
  const unpinned = useMemo(() => rootChats.filter((c) => c.pinnedAt == null).sort((a, b) => b.lastActiveAt - a.lastActiveAt), [rootChats])

  const childMap = useMemo(() => {
    const m = new Map<string, Chat[]>()
    for (const c of chats) {
      if (!c.parentId) continue
      const list = m.get(c.parentId) ?? []
      list.push(c)
      m.set(c.parentId, list)
    }
    return m
  }, [chats])

  const handleDeleteChat = useCallback(
    (e: React.MouseEvent, chat: Chat) => {
      e.stopPropagation()
      if (e.shiftKey) {
        onDeleteChat(chat.id)
        return
      }
      const childCount = childMap.get(chat.id)?.length ?? 0
      const extras: string[] = []
      if (childCount > 0) extras.push(`${childCount} child chat${childCount > 1 ? 's' : ''}`)
      setConfirmDialog({
        title: 'Delete Chat',
        message: `Delete "${chat.name}"${extras.length > 0 ? ` and its ${extras.join(' and ')}` : ''}?`,
        confirmLabel: 'Delete',
        destructive: true,
        onConfirm: () => {
          onDeleteChat(chat.id)
          setConfirmDialog(null)
        },
      })
    },
    [childMap, onDeleteChat],
  )

  const renderChat = useCallback((chat: Chat, depth: number) => {
    const children = childMap.get(chat.id) ?? []

    return (
      <ChatItem
        key={chat.id}
        chat={chat}
        isActive={chat.id === activeChatId}
        isUnread={unreadChatIds.has(chat.id)}
        depth={depth}
        menuOpen={menuState?.chatId === chat.id}
        defaultLlmCommand={defaultLlmCommand}
        onSelect={() => onSelectChat(chat.id)}
        onDelete={(e) => handleDeleteChat(e, chat)}
        onOpenMenu={(anchor) => openMenu(chat.id, anchor)}
        onCloseMenu={closeMenu}
      >
        {children.length > 0 && (
          <VStack gap={2} className={styles.childrenGroup} style={{ '--nest-depth': depth + 1 } as React.CSSProperties}>
            <AnimatePresence initial={false}>
              {children
                .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
                .map((child) => renderChat(child, depth + 1))}
            </AnimatePresence>
          </VStack>
        )}
      </ChatItem>
    )
  }, [activeChatId, unreadChatIds, childMap, defaultLlmCommand, onSelectChat, handleDeleteChat, menuState, closeMenu, openMenu])

  return (
    <VStack className={styles.sidebar} gap={3}>
      <div className={styles.titleArea} />

      <HStack align="center" className={styles.topActions}>
        <SidebarAction icon={<Plus size={14} />} label="New chat" shortcut={keybindings?.['new-chat'] ? formatHotkey(keybindings['new-chat']) : undefined} bordered onClick={(e) => onNewChat({ withDialog: e?.shiftKey })} />
      </HStack>

      <VStack className={styles.scrollArea} gap={3}>
        <VStack className={styles.section} gap={3}>
          {rootChats.length === 0 && (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: 0.15 }}
              className={styles.emptyState}
            >
              Press {keybindings?.['new-chat'] ? formatHotkey(keybindings['new-chat']) : '⌘N'} to start a new chat.
            </motion.div>
          )}
          {pinned.length > 0 && (
            <>
              <div className={styles.listLabel}>Pinned</div>
              <AnimatePresence initial={false}>
                {pinned.map((chat) => renderChat(chat, 0))}
              </AnimatePresence>
            </>
          )}
          {pinned.length > 0 && unpinned.length > 0 && (
            <div className={styles.pinnedDivider} />
          )}
          {unpinned.length > 0 && (
            <>
              <div className={styles.listLabel}>Recent</div>
              <AnimatePresence initial={false}>
                {unpinned.map((chat) => renderChat(chat, 0))}
              </AnimatePresence>
            </>
          )}
        </VStack>
      </VStack>

      <div className={styles.actions}>
        <SidebarAction icon={<ListTodo size={14} />} label="Tasks" badge={schedules.length} onClick={onToggleTasks} />
        <div className={styles.actionsDivider} />
        <SidebarAction icon={<Settings size={14} />} label="Settings" onClick={onToggleSettings} />
      </div>

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          destructive={confirmDialog.destructive}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {menuState && (() => {
        const chat = chats.find((c) => c.id === menuState.chatId)
        if (!chat) return null
        const depth = chat.parentId ? (chats.find((c) => c.id === chat.parentId)?.parentId ? 2 : 1) : 0
        const canAddChild = depth < maxChatDepth && !!onNewChildChat
        const isRoot = depth === 0
        return createPortal(
          <div ref={menuRef} className={styles.chatMenu} style={{ left: menuState.x, top: menuState.y }} onClick={(e) => e.stopPropagation()}>
            {canAddChild && (
              <button className={styles.menuItem} onClick={(e) => { closeMenu(); onNewChildChat(chat.id, { withDialog: e.shiftKey }) }}>
                <Plus size={10} /> Add child
              </button>
            )}
            {onRetitleChat && (
              <button className={styles.menuItem} onClick={() => { closeMenu(); onRetitleChat(chat.id) }}>
                <Wand2 size={10} /> Retitle
              </button>
            )}
            {isRoot && chat.pinnedAt != null && (
              <button className={styles.menuItem} onClick={() => { closeMenu(); onUnpinChat(chat.id) }}>
                <PinOff size={10} /> Unpin
              </button>
            )}
            {isRoot && chat.pinnedAt == null && (
              <button className={styles.menuItem} onClick={() => { closeMenu(); onPinChat(chat.id) }}>
                <Pin size={10} /> Pin
              </button>
            )}
          </div>,
          document.body,
        )
      })()}
    </VStack>
  )
}
