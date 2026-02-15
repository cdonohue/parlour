import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { SettingsPanel } from './SettingsPanel'
import { DEFAULT_SETTINGS } from '../../types'
import type { Settings, HotkeyAction } from '../../types'

const meta: Meta<typeof SettingsPanel> = {
  title: 'Components/SettingsPanel',
  component: SettingsPanel,
}
export default meta

export const Default: StoryObj = {
  render: () => {
    const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS })
    const updateKeybinding = (action: HotkeyAction, binding: string) => {
      setSettings((s) => ({
        ...s,
        keybindings: { ...s.keybindings, [action]: binding },
      }))
    }
    return (
      <SettingsPanel
        settings={settings}
        onUpdateSettings={(partial) => setSettings((s) => ({ ...s, ...partial }))}
        onClose={() => console.log('close')}
        keybindings={settings.keybindings}
        onUpdateKeybinding={updateKeybinding}
      />
    )
  },
}
