import type { Meta, StoryObj } from '@storybook/react'
import { PrStateIcon } from './PrStateIcon'

const meta: Meta<typeof PrStateIcon> = {
  title: 'Primitives/PrStateIcon',
  component: PrStateIcon,
}
export default meta

export const AllStates: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <span style={{ color: '#3dd68c' }}><PrStateIcon state="open" size={16} /></span>
      <span style={{ color: '#8b7ec8' }}><PrStateIcon state="merged" size={16} /></span>
      <span style={{ color: '#e5484d' }}><PrStateIcon state="closed" size={16} /></span>
    </div>
  ),
}
