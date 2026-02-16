import type { Meta, StoryObj } from '@storybook/react'
import { NewChatDialog } from './NewChatDialog'

const meta: Meta<typeof NewChatDialog> = {
  title: 'Components/NewChatDialog',
  component: NewChatDialog,
}
export default meta
type Story = StoryObj<typeof NewChatDialog>

export const Default: Story = {
  args: {
    defaultLlmCommand: 'claude',
    onConfirm: (config) => console.log('Confirm:', config),
    onCancel: () => console.log('Cancel'),
  },
}

export const CustomDefault: Story = {
  args: {
    defaultLlmCommand: 'gemini',
    onConfirm: (config) => console.log('Confirm:', config),
    onCancel: () => console.log('Cancel'),
  },
}
