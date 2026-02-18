import type { LifecycleEvent } from './events'

export type ClientMessage =
  | { type: 'pty:subscribe'; ptyId: string }
  | { type: 'pty:unsubscribe'; ptyId: string }
  | { type: 'pty:write'; ptyId: string; data: string }
  | { type: 'pty:resize'; ptyId: string; cols: number; rows: number }
  | { type: 'state:subscribe' }
  | { type: 'events:subscribe'; filters?: string[] }

export type ServerMessage =
  | { type: 'hello'; version: string }
  | { type: 'pty:data'; ptyId: string; data: string }
  | { type: 'pty:buffer'; ptyId: string; data: string }
  | { type: 'pty:title'; ptyId: string; title: string }
  | { type: 'pty:exit'; ptyId: string; exitCode: number }
  | { type: 'state:chats'; chats: unknown[] }
  | { type: 'state:schedules'; schedules: unknown[] }
  | { type: 'event'; event: LifecycleEvent }
