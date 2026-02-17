import { motion } from 'motion/react'
import { Plus, Pin, PinOff, X } from 'lucide-react'
import type { Chat } from '../../types'
import { relativeTime } from '../../utils/relative-time'
import { HStack, VStack } from '../../primitives/Stack/Stack'
import { Tooltip } from '../Tooltip/Tooltip'
import { TypewriterText } from '../TypewriterText/TypewriterText'
import styles from './ChatItem.module.css'

export interface ChatItemProps {
  chat: Chat
  isActive: boolean
  isUnread: boolean
  depth: number
  defaultLlmCommand: string
  canAddChild?: boolean
  children?: React.ReactNode
  onSelect: () => void
  onDelete: (e: React.MouseEvent) => void
  onAddChild?: (e: React.MouseEvent) => void
  onPin?: () => void
  onUnpin?: () => void
}

export function ChatItem({
  chat,
  isActive,
  isUnread,
  depth,
  defaultLlmCommand,
  canAddChild,
  children,
  onSelect,
  onDelete,
  onAddChild,
  onPin,
  onUnpin,
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
        className={`${styles.chatItem} ${depthClass} ${isActive ? styles.active : ''} ${isUnread ? styles.unread : ''}`}
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
        <div className={styles.chatActions}>
          {canAddChild && onAddChild && (
            <Tooltip label="Add child">
              <button
                className={styles.actionBtn}
                onClick={(e) => { e.stopPropagation(); onAddChild(e) }}
              >
                <Plus size={11} />
              </button>
            </Tooltip>
          )}
          {isRoot && chat.pinnedAt != null && onUnpin && (
            <Tooltip label="Unpin">
              <button
                className={styles.actionBtn}
                onClick={(e) => { e.stopPropagation(); onUnpin() }}
              >
                <PinOff size={11} />
              </button>
            </Tooltip>
          )}
          {isRoot && chat.pinnedAt == null && onPin && (
            <Tooltip label="Pin">
              <button
                className={styles.actionBtn}
                onClick={(e) => { e.stopPropagation(); onPin() }}
              >
                <Pin size={11} />
              </button>
            </Tooltip>
          )}
          <Tooltip label="Delete">
            <button
              className={`${styles.actionBtn} ${styles.deleteBtn}`}
              onClick={(e) => { e.stopPropagation(); onDelete(e) }}
            >
              <X size={11} />
            </button>
          </Tooltip>
        </div>
      </HStack>
      {children}
    </motion.div>
  )
}
