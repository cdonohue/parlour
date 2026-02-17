import type { Meta, StoryObj } from '@storybook/react'
import { Plus, Settings, Calendar } from 'lucide-react'
import { SidebarAction } from './SidebarAction'

const meta: Meta<typeof SidebarAction> = {
  title: 'Components/SidebarAction',
  component: SidebarAction,
  decorators: [(Story) => <div style={{ width: 240, background: 'var(--surface-1)', padding: 'var(--space-4)' }}><Story /></div>],
}
export default meta
type Story = StoryObj<typeof SidebarAction>

export const Default: Story = {
  args: { icon: <Plus size={14} />, label: 'New Chat', onClick: () => {} },
}

export const WithShortcut: Story = {
  args: { icon: <Plus size={14} />, label: 'New Chat', shortcut: '⌘N', onClick: () => {} },
}

export const WithBadge: Story = {
  args: { icon: <Calendar size={14} />, label: 'Tasks', badge: 3, onClick: () => {} },
}

export const Bordered: Story = {
  args: { icon: <Settings size={14} />, label: 'Settings', bordered: true, onClick: () => {} },
}

export const Inverted: Story = {
  args: { icon: <Plus size={14} />, label: 'New Chat', inverted: true, onClick: () => {} },
}

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SidebarAction icon={<Plus size={14} />} label="New Chat" shortcut="⌘N" onClick={() => {}} />
      <SidebarAction icon={<Calendar size={14} />} label="Tasks" badge={3} onClick={() => {}} />
      <SidebarAction icon={<Settings size={14} />} label="Settings" bordered onClick={() => {}} />
      <SidebarAction icon={<Plus size={14} />} label="Inverted" inverted onClick={() => {}} />
    </div>
  ),
}
