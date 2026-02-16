import type { ITheme } from '@xterm/xterm'

export const DARK_TERMINAL_THEME: ITheme = {
  background: '#0a0a0b',
  foreground: '#ededef',
  cursor: '#ededef',
  selectionBackground: 'rgba(110, 106, 222, 0.3)',
  black: '#0a0a0b',
  red: '#e5484d',
  green: '#3dd68c',
  yellow: '#d4a84b',
  blue: '#6e6ade',
  magenta: '#8b7ec8',
  cyan: '#5eb0ef',
  white: '#a0a0a8',
  brightBlack: '#5c5c66',
  brightRed: '#e5484d',
  brightGreen: '#3dd68c',
  brightYellow: '#d4a84b',
  brightBlue: '#6e6ade',
  brightMagenta: '#8b7ec8',
  brightCyan: '#5eb0ef',
  brightWhite: '#ededef',
}

export const LIGHT_TERMINAL_THEME: ITheme = {
  background: '#ffffff',
  foreground: '#1a1a1e',
  cursor: '#1a1a1e',
  selectionBackground: 'rgba(110, 106, 222, 0.15)',
  black: '#2a2a2c',
  red: '#c2364a',
  green: '#1a8d62',
  yellow: '#8d7500',
  blue: '#4f46a1',
  magenta: '#6b5690',
  cyan: '#2b7fa3',
  white: '#6e6e78',
  brightBlack: '#5c5c66',
  brightRed: '#c2364a',
  brightGreen: '#1a8d62',
  brightYellow: '#8d7500',
  brightBlue: '#4f46a1',
  brightMagenta: '#6b5690',
  brightCyan: '#2b7fa3',
  brightWhite: '#1a1a1e',
}

export function getTerminalTheme(mode: 'dark' | 'light'): ITheme {
  return mode === 'light' ? LIGHT_TERMINAL_THEME : DARK_TERMINAL_THEME
}
