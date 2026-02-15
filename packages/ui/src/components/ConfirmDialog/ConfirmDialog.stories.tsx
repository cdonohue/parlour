import type { Meta, StoryObj } from '@storybook/react'
import { ConfirmDialog } from './ConfirmDialog'

const meta: Meta<typeof ConfirmDialog> = {
  title: 'Components/ConfirmDialog',
  component: ConfirmDialog,
}
export default meta

export const Default: StoryObj = {
  args: {
    title: 'Delete Chat',
    message: 'Delete chat "feature-auth"? This will remove all project clones from disk.',
    confirmLabel: 'Delete',
    destructive: true,
    onConfirm: () => console.log('confirmed'),
    onCancel: () => console.log('cancelled'),
  },
}

export const NonDestructive: StoryObj = {
  args: {
    title: 'Replace Project',
    message: 'A project directory already exists. Replace it?',
    confirmLabel: 'Replace',
    destructive: false,
    onConfirm: () => console.log('confirmed'),
    onCancel: () => console.log('cancelled'),
  },
}
