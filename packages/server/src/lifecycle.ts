export type {
  TerminalEvent,
  HarnessEvent,
  CliEvent,
  LifecycleEvent,
  HarnessStatus,
} from '@chorale/api-types'

import type { LifecycleEvent } from '@chorale/api-types'

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
