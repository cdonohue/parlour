import type { Meta, StoryObj } from '@storybook/react'
import { Plus, ArrowRight, Trash2, Download, Check, Copy, ExternalLink, RefreshCw } from 'lucide-react'
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

export const IconLeading: Story = {
  name: 'Icon + Text',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button variant="primary"><Plus /> New chat</Button>
        <Button variant="ghost"><Download /> Export</Button>
        <Button variant="danger"><Trash2 /> Delete</Button>
        <Button variant="outline"><Copy /> Duplicate</Button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button variant="primary" size="sm"><Plus /> Add</Button>
        <Button variant="ghost" size="sm"><Download /> Export</Button>
        <Button variant="danger" size="sm"><Trash2 /> Remove</Button>
        <Button variant="outline" size="sm"><Copy /> Copy</Button>
      </div>
    </div>
  ),
}

export const IconTrailing: Story = {
  name: 'Text + Icon',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button variant="primary">Continue <ArrowRight /></Button>
        <Button variant="ghost">Open <ExternalLink /></Button>
        <Button variant="outline">Done <Check /></Button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button variant="primary" size="sm">Next <ArrowRight /></Button>
        <Button variant="ghost" size="sm">Open <ExternalLink /></Button>
        <Button variant="outline" size="sm">Done <Check /></Button>
      </div>
    </div>
  ),
}

export const IconBothSides: Story = {
  name: 'Icon + Text + Icon',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button variant="primary"><RefreshCw /> Retry <ArrowRight /></Button>
        <Button variant="ghost"><Download /> Save as <ExternalLink /></Button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button variant="primary" size="sm"><RefreshCw /> Retry <ArrowRight /></Button>
        <Button variant="ghost" size="sm"><Download /> Save as <ExternalLink /></Button>
      </div>
    </div>
  ),
}

