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
  black: '#000000',
  red: '#CD3131',
  green: '#116329',
  yellow: '#7D4E00',
  blue: '#0451A5',
  magenta: '#8B3FC7',
  cyan: '#0598BC',
  white: '#555555',
  brightBlack: '#4F4F4F',
  brightRed: '#CD3131',
  brightGreen: '#14CE14',
  brightYellow: '#B5BA00',
  brightBlue: '#0366D6',
  brightMagenta: '#BC05BC',
  brightCyan: '#0598BC',
  brightWhite: '#1a1a1e',
}

export function getTerminalTheme(mode: 'dark' | 'light'): ITheme {
  return mode === 'light' ? LIGHT_TERMINAL_THEME : DARK_TERMINAL_THEME
}
