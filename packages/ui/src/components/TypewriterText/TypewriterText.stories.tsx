import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { TypewriterText } from './TypewriterText'

const meta: Meta<typeof TypewriterText> = {
  title: 'Components/TypewriterText',
  component: TypewriterText,
}
export default meta
type Story = StoryObj<typeof TypewriterText>

export const Default: Story = {
  args: { text: 'Fix authentication token refresh' },
  decorators: [(Story) => <div style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)' }}><Story /></div>],
}

export const Interactive: Story = {
  render: () => {
    const titles = ['Fix auth bug', 'Refactor database queries', 'Add dark mode support', 'Investigate memory leak']
    const [index, setIndex] = useState(0)
    return (
      <div style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)' }}>
        <TypewriterText text={titles[index]} />
        <div style={{ marginTop: 'var(--space-8)' }}>
          <button
            onClick={() => setIndex((i) => (i + 1) % titles.length)}
            style={{ background: 'var(--surface-3)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '4px 12px', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)' }}
          >
            Change title
          </button>
        </div>
      </div>
    )
  },
}
