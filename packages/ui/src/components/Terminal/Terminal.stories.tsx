import type { Meta, StoryObj } from '@storybook/react'
import '../../styles/index.css'

const STANDARD_COLORS = [
  { name: 'black', var: '--term-black' },
  { name: 'red', var: '--term-red' },
  { name: 'green', var: '--term-green' },
  { name: 'yellow', var: '--term-yellow' },
  { name: 'blue', var: '--term-blue' },
  { name: 'magenta', var: '--term-magenta' },
  { name: 'cyan', var: '--term-cyan' },
  { name: 'white', var: '--term-white' },
] as const

const BRIGHT_COLORS = [
  { name: 'brightBlack', var: '--term-bright-black' },
  { name: 'brightRed', var: '--term-bright-red' },
  { name: 'brightGreen', var: '--term-bright-green' },
  { name: 'brightYellow', var: '--term-bright-yellow' },
  { name: 'brightBlue', var: '--term-bright-blue' },
  { name: 'brightMagenta', var: '--term-bright-magenta' },
  { name: 'brightCyan', var: '--term-bright-cyan' },
  { name: 'brightWhite', var: '--term-bright-white' },
] as const

const ALL_COLORS = [...STANDARD_COLORS, ...BRIGHT_COLORS]

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

function Swatch({ name, cssVar }: { name: string; cssVar: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 0, overflow: 'hidden' }}>
      <div style={{
        width: '100%',
        aspectRatio: '1',
        borderRadius: 'var(--radius-md)',
        background: `var(${cssVar})`,
        border: '1px solid var(--border-default)',
        marginBottom: 'var(--space-2)',
      }} />
      <div style={{
        fontSize: 9,
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-tertiary)',
        lineHeight: 1.2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {name}
      </div>
    </div>
  )
}

const meta: Meta = { title: 'Design/Terminal Palette' }
export default meta

export const Palette: StoryObj = {
  render: () => (
    <div style={container}>
      <div style={heading}>Terminal ANSI Palette</div>
      <div style={caption}>Toggle the theme toolbar to compare dark and light palettes</div>

      <div style={sectionLabel}>Standard</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 'var(--space-3)' }}>
        {STANDARD_COLORS.map((c) => <Swatch key={c.name} name={c.name} cssVar={c.var} />)}
      </div>

      <div style={sectionLabel}>Bright</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 'var(--space-3)' }}>
        {BRIGHT_COLORS.map((c) => <Swatch key={c.name} name={c.name} cssVar={c.var} />)}
      </div>

      <div style={sectionLabel}>Text sample</div>
      <div style={{
        padding: 'var(--space-8)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--term-bg)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        lineHeight: 1.8,
        border: '1px solid var(--border-default)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-2) var(--space-6)',
      }}>
        {ALL_COLORS.map((c) => (
          <span key={c.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: `var(${c.var})`, border: '1px solid var(--border-default)', flexShrink: 0 }} />
            <span style={{ color: `var(${c.var === '--term-black' || c.var === '--term-bright-black' ? '--term-fg' : c.var})` }}>{c.name}</span>
          </span>
        ))}
      </div>
    </div>
  ),
}
