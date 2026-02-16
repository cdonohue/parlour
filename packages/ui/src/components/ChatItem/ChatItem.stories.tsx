import type { Meta, StoryObj } from '@storybook/react'
import { ChatItem } from './ChatItem'
import type { Chat } from '../../types'

const baseChat: Chat = {
  id: '1',
  name: 'Fix auth token refresh',
  status: 'active',
  ptyId: 'pty-1',
  dirPath: '/tmp/chat-1',
  createdAt: Date.now() - 3600_000,
  lastActiveAt: Date.now() - 60_000,
  pinnedAt: null,
}

const noop = () => {}

const meta: Meta<typeof ChatItem> = {
  title: 'Components/ChatItem',
  component: ChatItem,
  decorators: [(Story) => <div style={{ width: 240, background: 'var(--surface-1)', padding: 'var(--space-2)' }}><Story /></div>],
  args: {
    chat: baseChat,
    isActive: false,
    isUnread: false,
    depth: 0,
    menuOpen: false,
    defaultLlmCommand: 'claude',
    onSelect: noop,
    onDelete: noop,
    onOpenMenu: noop,
    onCloseMenu: noop,
  },
}
export default meta
type Story = StoryObj<typeof ChatItem>

export const Default: Story = {}

export const Active: Story = { args: { isActive: true } }

export const Unread: Story = { args: { isUnread: true } }

export const Idle: Story = { args: { chat: { ...baseChat, status: 'idle' } } }

export const Done: Story = { args: { chat: { ...baseChat, status: 'done' } } }

export const Error: Story = { args: { chat: { ...baseChat, status: 'error' } } }

export const Nested: Story = { args: { depth: 1, chat: { ...baseChat, parentId: 'parent-1' } } }

export const CustomLlm: Story = { args: { chat: { ...baseChat, llmCommand: 'gemini' } } }
