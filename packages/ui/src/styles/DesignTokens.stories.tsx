import type { Meta, StoryObj } from '@storybook/react'
import '../styles/index.css'

const TYPOGRAPHY = {
  '--text-xs': '11px',
  '--text-sm': '12px',
  '--text-base': '13px',
  '--text-md': '14px',
  '--text-lg': '16px',
  '--text-xl': '18px',
}

const WEIGHTS = {
  '--weight-normal': '450',
  '--weight-medium': '500',
  '--weight-semibold': '600',
}

const LEADING = {
  '--leading-tight': '1.3',
  '--leading-normal': '1.5',
  '--leading-relaxed': '1.7',
}

const SPACING = {
  '--space-0': '0px',
  '--space-1': '2px',
  '--space-2': '4px',
  '--space-3': '6px',
  '--space-4': '8px',
  '--space-5': '10px',
  '--space-6': '12px',
  '--space-8': '16px',
  '--space-10': '20px',
  '--space-12': '24px',
  '--space-16': '32px',
}

const SURFACES = [
  { token: '--surface-0', value: '#0a0a0b', label: 'App background' },
  { token: '--surface-1', value: '#111113', label: 'Panel / card' },
  { token: '--surface-2', value: '#191a1c', label: 'Raised element' },
  { token: '--surface-3', value: '#1e1f21', label: 'Active / hover' },
  { token: '--surface-4', value: '#27282b', label: 'Elevated' },
]

const BORDERS = [
  { token: '--border-subtle', value: '#1a1a1e', label: 'Dividers, panel edges' },
  { token: '--border-default', value: '#27272b', label: 'Input borders' },
  { token: '--border-strong', value: '#37373f', label: 'Emphasis, hover' },
  { token: '--border-accent', value: '#6e6ade', label: 'Focus ring, active' },
]

const TEXT_COLORS = [
  { token: '--text-primary', value: '#ededef' },
  { token: '--text-secondary', value: '#e3e3e6' },
  { token: '--text-tertiary', value: '#94949c' },
  { token: '--text-ghost', value: '#3a3a42' },
  { token: '--text-inverse', value: '#0a0a0b' },
]

const ACCENTS = [
  { token: '--accent-blue', value: '#6e6ade' },
  { token: '--accent-blue-dim', value: '#3d3a7a' },
  { token: '--accent-blue-glow', value: 'rgba(110,106,222,0.08)' },
  { token: '--accent-cyan', value: '#5eb0ef' },
  { token: '--accent-purple', value: '#8b7ec8' },
  { token: '--accent-green', value: '#3dd68c' },
  { token: '--accent-green-muted', value: '#2ea571' },
  { token: '--accent-green-dim', value: 'rgba(61,214,140,0.10)' },
  { token: '--accent-red', value: '#e5484d' },
  { token: '--accent-red-dim', value: 'rgba(229,72,77,0.10)' },
  { token: '--accent-orange', value: '#d9834f' },
  { token: '--accent-orange-dim', value: 'rgba(217,131,79,0.10)' },
  { token: '--accent-yellow', value: '#d4a84b' },
]

const RADII = [
  { token: '--radius-sm', value: '4px' },
  { token: '--radius-md', value: '6px' },
  { token: '--radius-lg', value: '10px' },
  { token: '--radius-xl', value: '14px' },
  { token: '--radius-full', value: '100px' },
]

const SHADOWS = [
  { token: '--shadow-sm', value: '0 1px 2px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.15)' },
  { token: '--shadow-md', value: '0 2px 4px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.2)' },
  { token: '--shadow-lg', value: '0 4px 8px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.3)' },
  { token: '--shadow-inset', value: 'inset 0 1px 0 rgba(255,255,255,0.03)' },
]

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

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-6)',
  marginBottom: 'var(--space-2)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  height: 28,
}

const tokenCol: React.CSSProperties = { width: 150, flexShrink: 0, color: 'var(--text-tertiary)' }
const valueCol: React.CSSProperties = { width: 50, flexShrink: 0, color: 'var(--text-ghost)', textAlign: 'right' }

const divider: React.CSSProperties = {
  borderTop: '1px solid var(--border-subtle)',
  margin: 'var(--space-12) 0',
}

const meta: Meta = { title: 'Tokens' }
export default meta

export const Typography: StoryObj = {
  render: () => (
    <div style={container}>
      <div style={heading}>Typography</div>
      <div style={caption}>
        Inter for UI, Geist Mono for code. Scale: 11 / 12 / 13 / 14 / 16 / 18
      </div>

      <div style={sectionLabel}>Size scale</div>
      {Object.entries(TYPOGRAPHY).map(([t, v]) => (
        <div key={t} style={row}>
          <span style={tokenCol}>{t}</span>
          <span style={valueCol}>{v}</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: parseInt(v), color: 'var(--text-primary)' }}>
            Ag
          </span>
        </div>
      ))}

      <div style={divider} />

      <div style={sectionLabel}>Weights</div>
      {Object.entries(WEIGHTS).map(([t, v]) => (
        <div key={t} style={row}>
          <span style={tokenCol}>{t}</span>
          <span style={valueCol}>{v}</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)', fontWeight: parseInt(v), color: 'var(--text-primary)' }}>
            The quick brown fox jumps over the lazy dog
          </span>
        </div>
      ))}

      <div style={divider} />

      <div style={sectionLabel}>Line height</div>
      {Object.entries(LEADING).map(([t, v]) => (
        <div key={t} style={{ ...row, height: 'auto', marginBottom: 'var(--space-6)', alignItems: 'flex-start' }}>
          <span style={tokenCol}>{t}</span>
          <span style={valueCol}>{v}</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)', lineHeight: parseFloat(v), color: 'var(--text-primary)', maxWidth: 320 }}>
            The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.
          </span>
        </div>
      ))}

      <div style={divider} />

      <div style={sectionLabel}>All sizes rendered</div>
      {Object.entries(TYPOGRAPHY).map(([t, v]) => (
        <div key={t} style={{ ...row, height: 'auto', marginBottom: 'var(--space-4)' }}>
          <span style={tokenCol}>{t}</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: parseInt(v), color: 'var(--text-primary)' }}>
            The quick brown fox jumps over the lazy dog
          </span>
        </div>
      ))}
    </div>
  ),
}

export const Spacing: StoryObj = {
  render: () => (
    <div style={container}>
      <div style={heading}>Spacing</div>
      <div style={caption}>
        2px base unit. Token name = multiplier (--space-4 = 8px).
      </div>

      <div style={sectionLabel}>Scale</div>
      {Object.entries(SPACING).map(([t, v]) => {
        const px = parseInt(v)
        return (
          <div key={t} style={row}>
            <span style={tokenCol}>{t}</span>
            <span style={valueCol}>{v}</span>
            <div style={{ width: px, height: 'var(--text-md)', background: 'var(--accent-blue)', borderRadius: 'var(--space-1)', minWidth: px === 0 ? 0 : 1 }} />
          </div>
        )
      })}
    </div>
  ),
}

export const Colors: StoryObj = {
  name: 'Surfaces & Borders',
  render: () => (
    <div style={container}>
      <div style={heading}>Surfaces & Borders</div>
      <div style={caption}>
        Pure neutral grays with slight cool undertone.
      </div>

      <div style={sectionLabel}>Surfaces</div>
      <div style={{ display: 'flex', gap: 0, borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 'var(--space-12)' }}>
        {SURFACES.map(({ token, value, label }) => (
          <div key={token} style={{ flex: 1, background: value, padding: 'var(--space-12) var(--space-6) var(--space-6)', minHeight: 80 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
              {token}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)' }}>{value}</div>
            <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', color: 'var(--text-tertiary)', marginTop: 'var(--space-4)' }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={sectionLabel}>Borders</div>
      {BORDERS.map(({ token, value, label }) => (
        <div key={token} style={row}>
          <span style={tokenCol}>{token}</span>
          <span style={valueCol}>{value}</span>
          <div style={{ width: 80, height: 24, borderRadius: 'var(--radius-md)', border: `2px solid ${value}`, background: 'var(--surface-1)' }} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-ghost)' }}>{label}</span>
        </div>
      ))}

      <div style={{ ...divider, marginTop: 'var(--space-16)' }} />

      <div style={sectionLabel}>Text</div>
      {TEXT_COLORS.map(({ token, value }) => (
        <div key={token} style={row}>
          <span style={tokenCol}>{token}</span>
          <span style={valueCol}>{value}</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)', color: value, fontWeight: 'var(--weight-medium)' }}>
            Sample text
          </span>
        </div>
      ))}
    </div>
  ),
}

export const Accents: StoryObj = {
  name: 'Accent Colors',
  render: () => (
    <div style={container}>
      <div style={heading}>Accent Colors</div>
      <div style={caption}>
        Indigo-blue primary. Semantic colors for status.
      </div>

      <div style={sectionLabel}>Palette</div>
      {ACCENTS.map(({ token, value }) => (
        <div key={token} style={row}>
          <span style={tokenCol}>{token}</span>
          <div style={{ width: 40, height: 20, borderRadius: 'var(--radius-sm)', background: value, border: '1px solid var(--border-default)' }} />
        </div>
      ))}
    </div>
  ),
}

export const Radii: StoryObj = {
  render: () => (
    <div style={container}>
      <div style={heading}>Border Radii</div>
      <div style={caption}>Consistent rounding scale.</div>

      <div style={sectionLabel}>Scale</div>
      {RADII.map(({ token, value }) => {
        const px = parseInt(value)
        return (
          <div key={token} style={{ ...row, height: 'auto', marginBottom: 'var(--space-6)' }}>
            <span style={tokenCol}>{token}</span>
            <span style={valueCol}>{value}</span>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: px,
              background: 'var(--surface-3)',
              border: '1px solid var(--border-default)',
            }} />
          </div>
        )
      })}
    </div>
  ),
}

export const Shadows: StoryObj = {
  render: () => (
    <div style={container}>
      <div style={heading}>Shadows</div>
      <div style={caption}>Double-layer shadows for depth.</div>

      <div style={sectionLabel}>Scale</div>
      <div style={{ display: 'flex', gap: 'var(--space-12)', marginTop: 'var(--space-8)', background: 'var(--surface-1)', padding: 'var(--space-12)', borderRadius: 'var(--radius-lg)' }}>
        {SHADOWS.map(({ token, value }) => (
          <div key={token} style={{ textAlign: 'center' }}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: 'var(--radius-lg)',
              background: 'var(--surface-4)',
              boxShadow: value,
              marginBottom: 'var(--space-4)',
            }} />
            <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{token}</div>
          </div>
        ))}
      </div>
    </div>
  ),
}
