import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Toggle } from './Toggle'

const meta: Meta<typeof Toggle> = {
  title: 'Primitives/Toggle',
  component: Toggle,
}
export default meta

export const Default: StoryObj = {
  render: () => {
    const [v, setV] = useState(false)
    return <Toggle value={v} onChange={setV} />
  },
}

export const On: StoryObj = {
  render: () => {
    const [v, setV] = useState(true)
    return <Toggle value={v} onChange={setV} />
  },
}
