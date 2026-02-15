import { motion } from 'motion/react'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import type { Chat } from '../../types'
import { relativeTime } from '../../utils/relative-time'
import { HStack, VStack } from '../../primitives/Stack/Stack'
import { TypewriterText } from '../TypewriterText/TypewriterText'
import styles from './ChatItem.module.css'

export interface ChatItemProps {
  chat: Chat
  isActive: boolean
  isUnread: boolean
  depth: number
  menuOpen: boolean
  defaultLlmCommand: string
  children?: React.ReactNode
  onSelect: () => void
  onDelete: (e: React.MouseEvent) => void
  onOpenMenu: (anchor: HTMLElement) => void
  onCloseMenu: () => void
}

export function ChatItem({
  chat,
  isActive,
  isUnread,
  depth,
  menuOpen,
  defaultLlmCommand,
  children,
  onSelect,
  onDelete,
  onOpenMenu,
  onCloseMenu,
}: ChatItemProps) {
  const isRoot = depth === 0
  const depthClass = depth > 0 ? styles.nestedChat : ''

  return (
    <motion.div
      key={chat.id}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ height: { duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }, opacity: { duration: 0.1 } }}
      style={{ overflow: 'hidden' }}
    >
      <HStack
        align="flex-start"
        gap={3}
        className={`${styles.chatItem} ${depthClass} ${isActive ? styles.active : ''} ${isUnread ? styles.unread : ''} ${menuOpen ? styles.menuOpen : ''}`}
        style={{ cursor: 'pointer' }}
        onClick={onSelect}
      >
        <VStack flex="1" gap={2} className={styles.chatContent}>
          <TypewriterText text={chat.name} className={styles.chatName} speed={30} />
          <HStack gap={4} align="center" className={styles.chatMeta}>
            <span className={`${styles.statusDot} ${styles[chat.status]}`} />
            <span className={styles.llmBadge}>{chat.llmCommand || defaultLlmCommand}</span>
            {isRoot && <span>{relativeTime(chat.lastActiveAt)}</span>}
          </HStack>
        </VStack>
        <HStack gap={1} className={styles.chatActions}>
          <button
            className={styles.moreBtn}
            onClick={(e) => { e.stopPropagation(); menuOpen ? onCloseMenu() : onOpenMenu(e.currentTarget) }}
          >
            <MoreHorizontal size={13} />
          </button>
          <button
            className={styles.deleteBtn}
            onClick={(e) => { e.stopPropagation(); onDelete(e) }}
          >
            <Trash2 size={11} />
          </button>
        </HStack>
      </HStack>
      {children}
    </motion.div>
  )
}
