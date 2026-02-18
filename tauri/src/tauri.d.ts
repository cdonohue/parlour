declare module '@tauri-apps/api/core' {
  export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>
}

declare module '@tauri-apps/plugin-dialog' {
  export function open(options?: { directory?: boolean; multiple?: boolean }): Promise<string | null>
}

declare module '@tauri-apps/plugin-opener' {
  export function openUrl(url: string): Promise<void>
}

declare module '*.module.css' {
  const classes: { [key: string]: string }
  export default classes
}
