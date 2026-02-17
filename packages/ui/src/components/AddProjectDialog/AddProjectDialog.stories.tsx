import type { Meta, StoryObj } from '@storybook/react'
import { AddProjectDialog } from './AddProjectDialog'

const meta: Meta<typeof AddProjectDialog> = {
  title: 'Components/AddProjectDialog',
  component: AddProjectDialog,
}
export default meta
type Story = StoryObj<typeof AddProjectDialog>

export const Default: Story = {
  args: {
    onConfirm: (name, path) => console.log('Confirm:', name, path),
    onCancel: () => console.log('Cancel'),
    onBrowseDirectory: () => Promise.resolve('/Users/dev/my-project'),
    onCheckGitRepo: (path) => Promise.resolve(path.includes('project')),
  },
}
