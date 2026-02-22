import { useCallback, useEffect, useState } from 'react'
import { SettingsPanel as SettingsPanelUI } from '@chorale/ui'
import type { HotkeyAction } from '@chorale/ui'
import { usePlatform } from '@chorale/platform'
import { useAppStore } from '../store/app-store'

const CLI_DEFAULTS_FILES: Record<string, string> = {
  claude: 'settings.local.json',
  gemini: 'settings.json',
  codex: 'config.toml',
  opencode: 'opencode.json',
}


export function SettingsPanel() {
  const platform = usePlatform()
  const { settings, updateSettings, toggleSettings } = useAppStore()
  const [installedClis, setInstalledClis] = useState<string[]>([])
  const [llmDefaults, setLlmDefaults] = useState<Record<string, string>>({})
  const [openers, setOpeners] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    platform.cli.detect().then(setInstalledClis).catch(() => {})
    platform.app.discoverOpeners().then(setOpeners).catch(() => {})
  }, [platform])

  useEffect(() => {
    if (installedClis.length === 0) return
    Promise.all([
      platform.app.getChoralePath(),
      platform.cli.baseDefaults(),
    ]).then(async ([choralePath, baseDefaults]) => {
      const defaults: Record<string, string> = {}
      for (const cli of installedClis) {
        const filename = CLI_DEFAULTS_FILES[cli]
        if (!filename) continue
        try {
          const content = await platform.fs.readFile(`${choralePath}/llm-defaults/${cli}/${filename}`)
          defaults[cli] = (content as string).trim() ? (content as string) : baseDefaults[cli] ?? ''
        } catch {
          defaults[cli] = baseDefaults[cli] ?? ''
        }
      }
      setLlmDefaults(defaults)
    }).catch(() => {})
  }, [installedClis, platform])

  const onUpdateKeybinding = useCallback((action: HotkeyAction, binding: string) => {
    updateSettings({
      keybindings: { ...settings.keybindings, [action]: binding },
    })
  }, [settings.keybindings, updateSettings])

  const onSaveLlmDefaults = useCallback(async (cli: string, content: string) => {
    const choralePath = await platform.app.getChoralePath()
    const filename = CLI_DEFAULTS_FILES[cli]
    if (!filename) return
    await platform.fs.writeFile(`${choralePath}/llm-defaults/${cli}/${filename}`, content)
    setLlmDefaults((prev) => ({ ...prev, [cli]: content }))
  }, [platform])

  return (
    <SettingsPanelUI
      settings={settings}
      onUpdateSettings={updateSettings}
      onClose={toggleSettings}
      keybindings={settings.keybindings}
      onUpdateKeybinding={onUpdateKeybinding}
      installedClis={installedClis}
      llmDefaults={llmDefaults}
      onSaveLlmDefaults={onSaveLlmDefaults}
      openers={openers}
    />
  )
}
