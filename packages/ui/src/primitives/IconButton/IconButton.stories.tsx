import type { Meta, StoryObj } from '@storybook/react'
import { Plus, X, Settings } from 'lucide-react'
import { IconButton } from './IconButton'

const meta: Meta<typeof IconButton> = {
  title: 'Primitives/IconButton',
  component: IconButton,
}
export default meta

export const Default: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', gap: 8 }}>
      <IconButton icon={<Plus size={14} />} onClick={() => {}} title="Add" />
      <IconButton icon={<Settings size={14} />} onClick={() => {}} title="Settings" />
      <IconButton icon={<X size={14} />} onClick={() => {}} title="Close" variant="danger" />
    </div>
  ),
}

export const Small: StoryObj = {
  render: () => (
    <IconButton icon={<X size={12} />} onClick={() => {}} title="Close" size="sm" />
  ),
}
