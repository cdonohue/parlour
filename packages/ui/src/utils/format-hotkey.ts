const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')

export function formatHotkey(binding: string): string {
  return binding
    .split('+')
    .map((part) => {
      const key = part.trim()
      if (key === 'Mod') return IS_MAC ? '⌘' : 'Ctrl'
      if (key === 'Shift') return IS_MAC ? '⇧' : 'Shift'
      if (key === 'Alt') return IS_MAC ? '⌥' : 'Alt'
      if (key === 'Control') return IS_MAC ? '⌃' : 'Ctrl'
      if (key === ',') return ','
      if (key === '=') return '+'
      if (key === '-') return '−'
      return key.toUpperCase()
    })
    .join(IS_MAC ? '' : '+')
}
