export class ThemeManager {
  private mode: 'system' | 'dark' | 'light' = 'system'
  private resolved: 'dark' | 'light' = 'dark'
  private listeners: Array<(resolved: 'dark' | 'light') => void> = []

  getMode(): 'system' | 'dark' | 'light' {
    return this.mode
  }

  getResolved(): 'dark' | 'light' {
    return this.resolved
  }

  setMode(mode: 'system' | 'dark' | 'light'): void {
    this.mode = mode
  }

  setResolved(resolved: 'dark' | 'light'): void {
    if (this.resolved === resolved) return
    this.resolved = resolved
    for (const fn of this.listeners) fn(resolved)
  }

  onChange(fn: (resolved: 'dark' | 'light') => void): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn)
    }
  }
}
