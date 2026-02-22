import type { LifecycleEvent } from './events'

export type ClientMessage =
  | { type: 'pty:subscribe'; ptyId: string }
  | { type: 'pty:unsubscribe'; ptyId: string }
  | { type: 'pty:write'; ptyId: string; data: string }
  | { type: 'pty:resize'; ptyId: string; cols: number; rows: number }
  | { type: 'state:subscribe' }
  | { type: 'events:subscribe'; filters?: string[] }
  | { type: 'theme:resolved'; resolved: 'dark' | 'light' }

export type ServerMessage =
  | { type: 'hello'; version: string }
  | { type: 'pty:data'; ptyId: string; data: string }
  | { type: 'pty:buffer'; ptyId: string; data: string }
  | { type: 'pty:title'; ptyId: string; title: string }
  | { type: 'pty:exit'; ptyId: string; exitCode: number }
  | { type: 'pty:firstInput'; ptyId: string; input: string }
  | { type: 'state:chats'; chats: unknown[] }
  | { type: 'state:schedules'; schedules: unknown[] }
  | { type: 'event'; event: LifecycleEvent }
  | { type: 'notification'; chatId: string; chatName: string; status: string }
  | { type: 'theme:resolved'; resolved: 'dark' | 'light' }
