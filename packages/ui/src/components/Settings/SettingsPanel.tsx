import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Settings, HotkeyAction, Keybindings, ThemeMode } from '../../types'
import { DEFAULT_KEYBINDINGS, HOTKEY_LABELS } from '../../types'
import { formatHotkey } from '../../utils/format-hotkey'
import { FormRow, Toggle, TextInput, NumberStepper, Select, IconButton, Button } from '../../primitives'
import styles from './SettingsPanel.module.css'

const HOTKEY_ACTIONS: HotkeyAction[] = [
  'new-chat',
  'new-child-chat',
  'toggle-sidebar',
  'open-in-editor',
  'settings',
  'font-increase',
  'font-decrease',
  'font-reset',
]

function eventToBinding(e: KeyboardEvent): string | null {
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return null

  const parts: string[] = []
  if (e.metaKey || e.ctrlKey) parts.push('Mod')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')

  let key = e.key
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()

  if (!parts.includes(key)) parts.push(key)
  return parts.join('+')
}

function isMonospaced(family: string): boolean {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.font = `16px '${family}', monospace`
  return ctx.measureText('i').width === ctx.measureText('M').width
}

function useMonoFonts(): Array<{ value: string; label: string }> {
  const [fonts, setFonts] = useState<Array<{ value: string; label: string }>>([])

  useEffect(() => {
    if (!('queryLocalFonts' in window)) return

    ;(window as unknown as { queryLocalFonts: () => Promise<Array<{ family: string }>> })
      .queryLocalFonts()
      .then((localFonts) => {
        const seen = new Set<string>()
        const mono: Array<{ value: string; label: string }> = []

        for (const f of localFonts) {
          if (seen.has(f.family)) continue
          seen.add(f.family)
          if (isMonospaced(f.family)) {
            mono.push({ value: f.family, label: f.family })
          }
        }

        mono.sort((a, b) => a.label.localeCompare(b.label))
        setFonts(mono)
      })
      .catch(() => {})
  }, [])

  return fonts
}

const CLI_DEFAULTS_FILES: Record<string, string> = {
  claude: 'settings.local.json',
  gemini: 'settings.json',
  codex: 'config.toml',
  opencode: 'opencode.json',
}

interface SettingsPanelProps {
  settings: Settings
  onUpdateSettings: (partial: Partial<Settings>) => void
  onClose: () => void
  keybindings: Keybindings
  onUpdateKeybinding: (action: HotkeyAction, binding: string) => void
  installedClis?: string[]
  llmDefaults?: Record<string, string>
  onSaveLlmDefaults?: (cli: string, content: string) => void
  openers?: Array<{ id: string; name: string }>
}

export function SettingsPanel({
  settings,
  onUpdateSettings,
  onClose,
  keybindings,
  onUpdateKeybinding,
  installedClis,
  llmDefaults,
  onSaveLlmDefaults,
  openers,
}: SettingsPanelProps) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onUpdateSettings({ [key]: value })
  }

  const monoFonts = useMonoFonts()
  const [recordingAction, setRecordingAction] = useState<HotkeyAction | null>(null)

  const fontOptions = monoFonts.length > 0
    ? monoFonts
    : [{ value: settings.terminalFontFamily, label: settings.terminalFontFamily }]

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (recordingAction) {
        e.preventDefault()
        e.stopPropagation()

        if (e.key === 'Escape') {
          setRecordingAction(null)
          return
        }

        const binding = eventToBinding(e)
        if (binding) {
          onUpdateKeybinding(recordingAction, binding)
          setRecordingAction(null)
        }
        return
      }

      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose, recordingAction, onUpdateKeybinding])

  const hasCustomBindings = HOTKEY_ACTIONS.some(
    (a) => keybindings[a] !== DEFAULT_KEYBINDINGS[a]
  )

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerInner}>
            <h2 className={styles.title}>Settings</h2>
            <IconButton icon={<X />} onClick={onClose} title="Close" />
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Appearance</div>

            <FormRow label="Theme" description="App color scheme">
              <Select
                value={settings.theme}
                onChange={(v) => update('theme', v as ThemeMode)}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </FormRow>

            <FormRow label="Terminal font" description="Monospace font for terminals">
              <Select
                value={settings.terminalFontFamily}
                onChange={(v) => update('terminalFontFamily', v)}
                options={fontOptions}
              />
            </FormRow>

            <FormRow label="Terminal font size" description="Font size in pixels for terminal tabs">
              <NumberStepper value={settings.terminalFontSize} onChange={(v) => update('terminalFontSize', v)} />
            </FormRow>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>General</div>

            <FormRow
              label="Restore last chat"
              description="Restore the last active chat when the app starts"
              onClick={() => update('restoreLastChat', !settings.restoreLastChat)}
            >
              <Toggle value={settings.restoreLastChat} onChange={(v) => update('restoreLastChat', v)} />
            </FormRow>

            <FormRow
              label="Branch prefix"
              description="Prefix for new branches (e.g. user/)"
            >
              <TextInput
                value={settings.branchPrefix}
                onChange={(v) => update('branchPrefix', v)}
                placeholder="user/"
              />
            </FormRow>

            <FormRow
              label="Project roots"
              description="Directories to search when opening projects by name"
            >
              <TextInput
                value={(settings.projectRoots ?? []).join(', ')}
                onChange={(v) => update('projectRoots', v.split(',').map((s) => s.trim()).filter(Boolean))}
                placeholder="~/Projects, ~/work"
              />
            </FormRow>

            {openers && openers.length > 0 && (
              <FormRow label="Open in" description="Editor for opening projects">
                <Select
                  value={settings.lastOpenIn}
                  onChange={(v) => update('lastOpenIn', v)}
                  options={openers.map((o) => ({ value: o.id, label: o.name }))}
                />
              </FormRow>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>AI Agent</div>

            <FormRow
              label="Default LLM"
              description="CLI used for new chats"
            >
              {installedClis && installedClis.length > 0 ? (
                <Select
                  value={installedClis.includes(settings.llmCommand) ? settings.llmCommand : ''}
                  onChange={(v) => update('llmCommand', v)}
                  options={[
                    ...installedClis.map((c) => ({ value: c, label: c })),
                    ...(!installedClis.includes(settings.llmCommand) && settings.llmCommand
                      ? [{ value: settings.llmCommand, label: settings.llmCommand }]
                      : []),
                  ]}
                />
              ) : (
                <TextInput
                  value={settings.llmCommand}
                  onChange={(v) => update('llmCommand', v)}
                  placeholder="claude"
                />
              )}
            </FormRow>

            <FormRow
              label="Max chat depth"
              description="Maximum nesting depth for child chats (1–5)"
            >
              <NumberStepper
                value={settings.maxChatDepth}
                onChange={(v) => update('maxChatDepth', Math.max(1, Math.min(5, v)))}
              />
            </FormRow>
          </div>

          {onSaveLlmDefaults && installedClis && installedClis.length > 0 && llmDefaults && Object.keys(llmDefaults).length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Chat Config</div>
              <div className={styles.defaultsDescription}>
                Written to each new chat directory on creation. Parlour also injects MCP server config and agent instructions automatically.
              </div>

              {installedClis.map((cli) => {
                const filename = CLI_DEFAULTS_FILES[cli]
                if (!filename) return null
                return (
                  <div key={cli}>
                    <div className={styles.defaultsLabel}>
                      .{cli}/{filename}
                    </div>
                    <textarea
                      key={llmDefaults[cli] ? `${cli}-loaded` : cli}
                      className={styles.defaultsTextarea}
                      defaultValue={llmDefaults[cli] ?? ''}
                      onBlur={(e) => onSaveLlmDefaults(cli, e.currentTarget.value)}
                    />
                  </div>
                )
              })}
            </div>
          )}

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Keyboard Shortcuts</div>

            {HOTKEY_ACTIONS.map((action) => (
              <div key={action} className={styles.shortcutRow}>
                <span className={styles.shortcutAction}>{HOTKEY_LABELS[action]}</span>
                <button
                  className={`${styles.kbd} ${recordingAction === action ? styles.kbdRecording : ''}`}
                  onClick={() => setRecordingAction(recordingAction === action ? null : action)}
                >
                  {recordingAction === action ? 'Press keys…' : formatHotkey(keybindings[action])}
                </button>
              </div>
            ))}

            {hasCustomBindings && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onUpdateSettings({ keybindings: DEFAULT_KEYBINDINGS })}
              >
                Reset to defaults
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
