type ChatStatus = 'active' | 'idle' | 'done' | 'error'

export type TerminalEvent =
  | { type: 'chat:created'; chatId: string; name: string }
  | { type: 'chat:resumed'; chatId: string; ptyId: string }
  | { type: 'chat:deleted'; chatId: string }
  | { type: 'chat:status'; chatId: string; from: ChatStatus; to: ChatStatus }
  | { type: 'pty:spawned'; ptyId: string; chatId: string }
  | { type: 'pty:exit'; ptyId: string; chatId: string; exitCode: number }
  | { type: 'schedule:triggered'; scheduleId: string; chatId: string }
  | { type: 'schedule:completed'; scheduleId: string; status: string }

export type HarnessEvent =
  | { type: 'harness:tool:start'; chatId: string; tool: string }
  | { type: 'harness:tool:end'; chatId: string; tool: string }
  | { type: 'harness:stop'; chatId: string; reason?: string }
  | { type: 'harness:thinking'; chatId: string }
  | { type: 'harness:writing'; chatId: string }
  | { type: 'harness:waiting'; chatId: string }
  | { type: 'harness:status'; chatId: string; status: 'idle' | 'thinking' | 'writing' | 'tool-use' | 'waiting' | 'done' | 'error'; tool?: string }

export type CliEvent =
  | { type: 'cli:dispatch'; chatId: string; parentId?: string; prompt: string }
  | { type: 'cli:status'; chatId: string; queriedId?: string }
  | { type: 'cli:schedule'; chatId: string; action: 'create' | 'cancel' | 'list' | 'run' }
  | { type: 'cli:report'; chatId: string; parentId: string }
  | { type: 'cli:project'; chatId: string; action: 'list' | 'open' }
  | { type: 'cli:hook'; chatId: string; event: string; data?: Record<string, unknown> }

export type LifecycleEvent = TerminalEvent | HarnessEvent | CliEvent

type Handler = (event: LifecycleEvent) => void
type Unsubscribe = () => void

export interface Lifecycle {
  emit(event: LifecycleEvent): void
  on(type: string, handler: Handler): Unsubscribe
}

class LifecycleEmitter implements Lifecycle {
  private handlers = new Map<string, Set<Handler>>()

  emit(event: LifecycleEvent): void {
    const wildcard = this.handlers.get('*')
    if (wildcard) {
      for (const h of wildcard) h(event)
    }

    const specific = this.handlers.get(event.type)
    if (specific) {
      for (const h of specific) h(event)
    }

    const prefix = event.type.split(':').slice(0, -1).join(':')
    if (prefix) {
      const prefixed = this.handlers.get(prefix + ':*')
      if (prefixed) {
        for (const h of prefixed) h(event)
      }
    }
  }

  on(type: string, handler: Handler): Unsubscribe {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler)
    return () => { set!.delete(handler) }
  }
}

export const lifecycle = new LifecycleEmitter()
