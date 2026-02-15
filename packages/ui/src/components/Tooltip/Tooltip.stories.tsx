import type { Meta, StoryObj } from '@storybook/react'
import { Tooltip } from './Tooltip'

const meta: Meta<typeof Tooltip> = {
  title: 'Components/Tooltip',
  component: Tooltip,
}
export default meta

export const Default: StoryObj = {
  render: () => (
    <div style={{ padding: 40 }}>
      <Tooltip label="New terminal" shortcut="⌘T">
        <button style={{ padding: '6px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', cursor: 'pointer' }}>
          Hover me
        </button>
      </Tooltip>
    </div>
  ),
}

export const LabelOnly: StoryObj = {
  render: () => (
    <div style={{ padding: 40 }}>
      <Tooltip label="Settings">
        <button style={{ padding: '6px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', cursor: 'pointer' }}>
          No shortcut
        </button>
      </Tooltip>
    </div>
  ),
}
