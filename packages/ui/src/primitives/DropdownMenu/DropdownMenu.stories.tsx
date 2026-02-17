import type { Meta, StoryObj } from '@storybook/react'
import { DropdownMenu } from './DropdownMenu'
import { Button } from '../Button/Button'

const meta: Meta<typeof DropdownMenu> = {
  title: 'Primitives/DropdownMenu',
  component: DropdownMenu,
}
export default meta
type Story = StoryObj<typeof DropdownMenu>

export const Default: Story = {
  args: {
    items: [
      { id: 'rename', name: 'Rename' },
      { id: 'duplicate', name: 'Duplicate' },
      { id: 'delete', name: 'Delete' },
    ],
    onSelect: (id) => console.log('Selected:', id),
  },
  render: (args) => (
    <div style={{ padding: 40 }}>
      <DropdownMenu {...args}>
        {({ open }) => <Button variant="outline" onClick={open}>Open Menu</Button>}
      </DropdownMenu>
    </div>
  ),
}
