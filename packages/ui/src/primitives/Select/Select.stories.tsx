import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Select } from './Select'

const meta: Meta<typeof Select> = {
  title: 'Primitives/Select',
  component: Select,
}
export default meta

const options = [
  { value: 'github', label: 'GitHub' },
  { value: 'graphite', label: 'Graphite' },
  { value: 'devinreview', label: 'Devin Review' },
]

export const Default: StoryObj = {
  render: () => {
    const [v, setV] = useState('github')
    return <Select value={v} onChange={setV} options={options} />
  },
}
