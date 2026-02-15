import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Dialog } from './Dialog'

const meta: Meta<typeof Dialog> = {
  title: 'Primitives/Dialog',
  component: Dialog,
}
export default meta

export const Default: StoryObj = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <>
        <button onClick={() => setOpen(true)}>Open Dialog</button>
        <Dialog open={open} onClose={() => setOpen(false)} title="Example Dialog">
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            Dialog content goes here.
          </p>
        </Dialog>
      </>
    )
  },
}
