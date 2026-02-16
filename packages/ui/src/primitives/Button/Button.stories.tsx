import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'Primitives/Button',
  component: Button,
}
export default meta
type Story = StoryObj<typeof Button>

export const Ghost: Story = { args: { children: 'Ghost', variant: 'ghost' } }
export const Primary: Story = { args: { children: 'Primary', variant: 'primary' } }
export const Danger: Story = { args: { children: 'Danger', variant: 'danger' } }
export const Outline: Story = { args: { children: 'Outline', variant: 'outline' } }
export const OutlineDanger: Story = { args: { children: 'Outline Danger', variant: 'outlineDanger' } }
export const Dashed: Story = { args: { children: 'Dashed', variant: 'dashed' } }
export const Small: Story = { args: { children: 'Small', variant: 'primary', size: 'sm' } }
export const Disabled: Story = { args: { children: 'Disabled', variant: 'primary', disabled: true } }
export const FullWidth: Story = { args: { children: 'Full Width', variant: 'primary', fullWidth: true } }

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <Button variant="ghost">Ghost</Button>
      <Button variant="primary">Primary</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="outlineDanger">Outline Danger</Button>
      <Button variant="dashed">Dashed</Button>
      <Button variant="primary" size="sm">Small</Button>
      <Button variant="primary" disabled>Disabled</Button>
    </div>
  ),
}
