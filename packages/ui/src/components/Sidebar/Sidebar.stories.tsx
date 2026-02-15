import type { Meta, StoryObj } from '@storybook/react'
import { Sidebar } from './Sidebar'
import type { Chat } from '../../types'

const meta: Meta<typeof Sidebar> = {
  title: 'Components/Sidebar',
  component: Sidebar,
}
export default meta

const chats: Chat[] = [
  { id: 'c1', name: 'Implement auth flow', status: 'active', ptyId: 'pty1', dirPath: '/tmp/c1', createdAt: Date.now() - 3600000, lastActiveAt: Date.now() - 600000, pinnedAt: null, llmCommand: 'claude' },
  { id: 'c2', name: 'Fix sidebar layout', status: 'done', ptyId: null, dirPath: '/tmp/c2', createdAt: Date.now() - 86400000, lastActiveAt: Date.now() - 86400000, pinnedAt: null, llmCommand: 'codex' },
  { id: 'c3', name: 'Subtask: write tests', status: 'done', ptyId: null, dirPath: '/tmp/c3', createdAt: Date.now() - 1800000, lastActiveAt: Date.now() - 1800000, pinnedAt: null, parentId: 'c1' },
]

const noop = () => {}

export const Populated: StoryObj = {
  render: () => (
    <div style={{ width: 244, height: 500 }}>
      <Sidebar
        chats={chats}
        activeChatId="c1"
        unreadChatIds={new Set(['c2'])}
        onSelectChat={noop}
        onNewChat={noop}
        onNewChildChat={noop}
        onDeleteChat={noop}
        onPinChat={noop}
        onUnpinChat={noop}
        onToggleSettings={noop}
        onToggleTasks={noop}
      />
    </div>
  ),
}

const chatsWithPinned: Chat[] = [
  { id: 'c1', name: 'Implement auth flow', status: 'active', ptyId: 'pty1', dirPath: '/tmp/c1', createdAt: Date.now() - 3600000, lastActiveAt: Date.now() - 600000, pinnedAt: Date.now() - 7200000, llmCommand: 'claude' },
  { id: 'c2', name: 'Fix sidebar layout', status: 'done', ptyId: null, dirPath: '/tmp/c2', createdAt: Date.now() - 86400000, lastActiveAt: Date.now() - 86400000, pinnedAt: null, llmCommand: 'codex' },
  { id: 'c3', name: 'Refactor store', status: 'idle', ptyId: null, dirPath: '/tmp/c4', createdAt: Date.now() - 172800000, lastActiveAt: Date.now() - 172800000, pinnedAt: null, llmCommand: 'claude' },
]

export const WithPinned: StoryObj = {
  render: () => (
    <div style={{ width: 244, height: 500 }}>
      <Sidebar
        chats={chatsWithPinned}
        activeChatId="c1"
        unreadChatIds={new Set()}
        onSelectChat={noop}
        onNewChat={noop}
        onDeleteChat={noop}
        onPinChat={noop}
        onUnpinChat={noop}
        onToggleSettings={noop}
        onToggleTasks={noop}
      />
    </div>
  ),
}

export const Empty: StoryObj = {
  render: () => (
    <div style={{ width: 244, height: 400 }}>
      <Sidebar
        chats={[]}
        activeChatId={null}
        unreadChatIds={new Set()}
        onSelectChat={noop}
        onNewChat={noop}
        onDeleteChat={noop}
        onPinChat={noop}
        onUnpinChat={noop}
        onToggleSettings={noop}
        onToggleTasks={noop}
      />
    </div>
  ),
}
