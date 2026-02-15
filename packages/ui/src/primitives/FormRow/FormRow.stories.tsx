import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { FormRow } from './FormRow'
import { Toggle } from '../Toggle/Toggle'
import { NumberStepper } from '../NumberStepper/NumberStepper'

const meta: Meta<typeof FormRow> = {
  title: 'Primitives/FormRow',
  component: FormRow,
}
export default meta

export const WithToggle: StoryObj = {
  render: () => {
    const [v, setV] = useState(true)
    return (
      <div style={{ width: 400 }}>
        <FormRow
          label="Auto-save on blur"
          description="Automatically save files when switching away"
          onClick={() => setV(!v)}
        >
          <Toggle value={v} onChange={setV} />
        </FormRow>
      </div>
    )
  },
}

export const WithStepper: StoryObj = {
  render: () => {
    const [v, setV] = useState(14)
    return (
      <div style={{ width: 400 }}>
        <FormRow label="Font size" description="Terminal font size in pixels">
          <NumberStepper value={v} onChange={setV} min={8} max={32} />
        </FormRow>
      </div>
    )
  },
}
