import type { Meta, StoryObj } from '@storybook/react'
import { WorkspaceDialog } from './WorkspaceDialog'

const meta: Meta<typeof WorkspaceDialog> = {
  title: 'Components/WorkspaceDialog',
  component: WorkspaceDialog,
}
export default meta
type Story = StoryObj<typeof WorkspaceDialog>

export const Default: Story = {
  args: {
    project: { name: 'parlour', repoPath: '/Users/dev/parlour' },
    branchPrefix: 'chad/',
    onConfirm: (name, branch, isNew, base) => console.log('Confirm:', { name, branch, isNew, base }),
    onCancel: () => console.log('Cancel'),
    getBranches: () => Promise.resolve(['main', 'develop', 'feature/auth', 'chad/dark-mode']),
  },
}

export const NoBranchPrefix: Story = {
  args: {
    project: { name: 'api', repoPath: '/Users/dev/api' },
    onConfirm: (name, branch, isNew, base) => console.log('Confirm:', { name, branch, isNew, base }),
    onCancel: () => console.log('Cancel'),
    getBranches: () => Promise.resolve(['main', 'staging']),
  },
}
