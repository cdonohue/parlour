import type { HarnessEvent } from './lifecycle'
import { lifecycle } from './lifecycle'

export type HarnessStatus = 'idle' | 'thinking' | 'writing' | 'tool-use' | 'waiting' | 'done' | 'error'

export interface HarnessState {
  status: HarnessStatus
  currentTool?: string
  lastActivity: number
  toolsUsed: number
}

export class HarnessTracker {
  private chatId: string
  private state: HarnessState

  constructor(chatId: string) {
    this.chatId = chatId
    this.state = { status: 'idle', lastActivity: Date.now(), toolsUsed: 0 }
  }

  handleEvent(event: HarnessEvent): void {
    const prev = this.state.status
    this.state.lastActivity = Date.now()

    switch (event.type) {
      case 'harness:tool:start':
        this.state.status = 'tool-use'
        this.state.currentTool = event.tool
        this.state.toolsUsed++
        break
      case 'harness:tool:end':
        this.state.status = 'writing'
        this.state.currentTool = undefined
        break
      case 'harness:thinking':
        this.state.status = 'thinking'
        break
      case 'harness:writing':
        this.state.status = 'writing'
        break
      case 'harness:waiting':
        this.state.status = 'waiting'
        break
      case 'harness:stop':
        this.state.status = 'done'
        this.state.currentTool = undefined
        break
      case 'harness:status':
        this.state.status = event.status
        if (event.tool) this.state.currentTool = event.tool
        break
    }

    if (this.state.status !== prev) {
      lifecycle.emit({
        type: 'harness:status',
        chatId: this.chatId,
        status: this.state.status,
        tool: this.state.currentTool,
      })
    }
  }

  getState(): HarnessState {
    return { ...this.state }
  }

  markDone(): void {
    this.state.status = 'done'
    this.state.currentTool = undefined
  }

  markError(): void {
    this.state.status = 'error'
    this.state.currentTool = undefined
  }
}
