import type { Meta, StoryObj } from '@storybook/react'
import { DARK_TERMINAL_THEME, LIGHT_TERMINAL_THEME } from '../../utils/terminal-theme'
import type { ITheme } from '@xterm/xterm'
import '../../styles/index.css'

const ANSI_NAMES = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
] as const

type AnsiKey = typeof ANSI_NAMES[number]

const container: React.CSSProperties = {
  padding: 'var(--space-16)',
  maxWidth: 720,
  fontFamily: 'var(--font-ui)',
}

const heading: React.CSSProperties = {
  fontSize: 'var(--text-lg)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-primary)',
  marginBottom: 'var(--space-2)',
}

const caption: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--text-tertiary)',
  marginBottom: 'var(--space-12)',
}

const sectionLabel: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 'var(--space-5)',
  marginTop: 'var(--space-12)',
}

function PaletteGrid({ theme, label }: { theme: ITheme; label: string }) {
  return (
    <div>
      <div style={sectionLabel}>{label}</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: 'var(--space-3)',
      }}>
        {ANSI_NAMES.map((name) => {
          const color = theme[name as AnsiKey] as string
          return (
            <div key={name} style={{ textAlign: 'center' }}>
              <div style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: 'var(--radius-md)',
                background: color,
                border: '1px solid var(--border-default)',
                marginBottom: 'var(--space-2)',
              }} />
              <div style={{
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-tertiary)',
                lineHeight: 1.2,
              }}>
                {name}
              </div>
              <div style={{
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-ghost)',
              }}>
                {color}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{
        marginTop: 'var(--space-6)',
        padding: 'var(--space-8)',
        borderRadius: 'var(--radius-md)',
        background: theme.background as string,
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        lineHeight: 1.6,
        border: '1px solid var(--border-default)',
      }}>
        {ANSI_NAMES.map((name) => (
          <span key={name} style={{ color: theme[name as AnsiKey] as string, marginRight: 8 }}>
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}

const meta: Meta = { title: 'Terminal/Palette' }
export default meta

export const DarkPalette: StoryObj = {
  render: () => (
    <div style={container}>
      <div style={heading}>Terminal ANSI Palette</div>
      <div style={caption}>16 ANSI colors as rendered in the terminal</div>
      <PaletteGrid theme={DARK_TERMINAL_THEME} label="Dark" />
    </div>
  ),
}

export const LightPalette: StoryObj = {
  render: () => (
    <div style={container}>
      <div style={heading}>Terminal ANSI Palette</div>
      <div style={caption}>16 ANSI colors as rendered in the terminal</div>
      <PaletteGrid theme={LIGHT_TERMINAL_THEME} label="Light" />
    </div>
  ),
}

export const Comparison: StoryObj = {
  render: () => (
    <div style={container}>
      <div style={heading}>Terminal ANSI Palette</div>
      <div style={caption}>Side-by-side comparison of dark and light palettes</div>
      <PaletteGrid theme={DARK_TERMINAL_THEME} label="Dark" />
      <PaletteGrid theme={LIGHT_TERMINAL_THEME} label="Light" />
    </div>
  ),
}
