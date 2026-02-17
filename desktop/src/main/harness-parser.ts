import type { HarnessEvent } from './lifecycle'

export interface HarnessParser {
  feed(chatId: string, data: string): HarnessEvent[]
}

const TOOL_START_RE = /╭─+\s*(\w+)/
const TOOL_END_RE = /╰─+/
const THINKING_RE = /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏|Thinking/
const COST_RE = /Total cost:/
const PROMPT_RE = /[❯>$]\s*$/

export class ClaudeOutputParser implements HarnessParser {
  private inTool = false
  private currentTool: string | null = null

  feed(chatId: string, data: string): HarnessEvent[] {
    const events: HarnessEvent[] = []

    for (const line of data.split('\n')) {
      const toolStart = TOOL_START_RE.exec(line)
      if (toolStart && !this.inTool) {
        this.inTool = true
        this.currentTool = toolStart[1]
        events.push({ type: 'harness:tool:start', chatId, tool: this.currentTool })
        continue
      }

      if (TOOL_END_RE.test(line) && this.inTool) {
        events.push({ type: 'harness:tool:end', chatId, tool: this.currentTool ?? 'unknown' })
        this.inTool = false
        this.currentTool = null
        continue
      }

      if (THINKING_RE.test(line) && !this.inTool) {
        events.push({ type: 'harness:thinking', chatId })
        continue
      }

      if (COST_RE.test(line)) {
        events.push({ type: 'harness:stop', chatId, reason: 'cost-summary' })
        continue
      }

      if (PROMPT_RE.test(line.trim()) && !this.inTool) {
        events.push({ type: 'harness:waiting', chatId })
      }
    }

    return events
  }
}

export class GenericOutputParser implements HarnessParser {
  private lastOutputAt = 0
  private lastState: string | null = null

  feed(chatId: string, data: string): HarnessEvent[] {
    const events: HarnessEvent[] = []
    const now = Date.now()
    const elapsed = now - this.lastOutputAt
    this.lastOutputAt = now

    if (elapsed > 5000 && this.lastState !== 'writing') {
      events.push({ type: 'harness:writing', chatId })
      this.lastState = 'writing'
    }

    if (PROMPT_RE.test(data.trim())) {
      events.push({ type: 'harness:waiting', chatId })
      this.lastState = 'waiting'
    }

    return events
  }
}

export function createParser(cliType: string): HarnessParser {
  if (cliType === 'claude') return new ClaudeOutputParser()
  return new GenericOutputParser()
}
