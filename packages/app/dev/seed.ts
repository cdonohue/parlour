import type { Chat } from '@chorale/ui'

const now = Date.now()
const HOUR = 3600_000

export const SEED_CHATS: Chat[] = [
  {
    id: 'chat-1',
    name: 'Refactor auth middleware',
    status: 'active',
    ptyId: null,
    dirPath: '/tmp/chorale/chats/chat-1',
    createdAt: now - 2 * HOUR,
    lastActiveAt: now - 5_000,
    pinnedAt: now - HOUR,
  },
  {
    id: 'chat-2',
    name: 'Add dark mode support',
    status: 'done',
    ptyId: null,
    dirPath: '/tmp/chorale/chats/chat-2',
    createdAt: now - 24 * HOUR,
    lastActiveAt: now - 12 * HOUR,
    pinnedAt: null,
  },
  {
    id: 'chat-3',
    name: 'Fix CI pipeline',
    status: 'error',
    ptyId: null,
    dirPath: '/tmp/chorale/chats/chat-3',
    createdAt: now - 3 * HOUR,
    lastActiveAt: now - 2 * HOUR,
    pinnedAt: null,
    parentId: 'chat-1',
  },
]
