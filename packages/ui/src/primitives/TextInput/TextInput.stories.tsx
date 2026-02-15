import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { TextInput } from './TextInput'

const meta: Meta<typeof TextInput> = {
  title: 'Primitives/TextInput',
  component: TextInput,
}
export default meta

export const Default: StoryObj = {
  render: () => {
    const [v, setV] = useState('')
    return <TextInput value={v} onChange={setV} placeholder="Enter text..." />
  },
}

export const WithValue: StoryObj = {
  render: () => {
    const [v, setV] = useState('/bin/zsh')
    return <TextInput value={v} onChange={setV} />
  },
}
