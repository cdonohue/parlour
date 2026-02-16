import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { NumberStepper } from './NumberStepper'

const meta: Meta<typeof NumberStepper> = {
  title: 'Primitives/NumberStepper',
  component: NumberStepper,
  decorators: [(Story) => <div style={{ width: 'fit-content' }}><Story /></div>],
}
export default meta

export const Default: StoryObj = {
  render: () => {
    const [v, setV] = useState(14)
    return <NumberStepper value={v} onChange={setV} min={8} max={32} />
  },
}

export const AtMin: StoryObj = {
  render: () => {
    const [v, setV] = useState(8)
    return <NumberStepper value={v} onChange={setV} min={8} max={32} />
  },
}
