import { describe, it, expect, beforeEach } from 'vitest'
import { ClaudeOutputParser, GenericOutputParser, createParser } from '../harness-parser'

describe('ClaudeOutputParser', () => {
  let parser: ClaudeOutputParser

  beforeEach(() => {
    parser = new ClaudeOutputParser()
  })

  it('detects tool start from box-drawing header', () => {
    const events = parser.feed('chat1', '╭──────── Read')
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'harness:tool:start', chatId: 'chat1', tool: 'Read' })
  })

  it('detects tool end from box-drawing footer', () => {
    parser.feed('chat1', '╭──────── Read')
    const events = parser.feed('chat1', '╰──────────')
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'harness:tool:end', chatId: 'chat1', tool: 'Read' })
  })

  it('ignores tool end without prior tool start', () => {
    const events = parser.feed('chat1', '╰──────────')
    expect(events).toHaveLength(0)
  })

  it('detects thinking indicators', () => {
    const events = parser.feed('chat1', '⠋ Thinking...')
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('harness:thinking')
  })

  it('does not emit thinking while inside tool block', () => {
    parser.feed('chat1', '╭──────── Edit')
    const events = parser.feed('chat1', '⠋ Thinking...')
    expect(events).toHaveLength(0)
  })

  it('detects cost summary as stop', () => {
    const events = parser.feed('chat1', 'Total cost: $0.42')
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'harness:stop', chatId: 'chat1', reason: 'cost-summary' })
  })

  it('detects prompt return as waiting', () => {
    const events = parser.feed('chat1', '❯ ')
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('harness:waiting')
  })

  it('detects $ prompt as waiting', () => {
    const events = parser.feed('chat1', '$ ')
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('harness:waiting')
  })

  it('handles multiline input with mixed events', () => {
    const data = '⠋ Thinking...\n╭──────── Read\nsome content\n╰──────────'
    const events = parser.feed('chat1', data)
    expect(events).toHaveLength(3)
    expect(events[0].type).toBe('harness:thinking')
    expect(events[1].type).toBe('harness:tool:start')
    expect(events[2].type).toBe('harness:tool:end')
  })
})

describe('GenericOutputParser', () => {
  it('detects prompt return as waiting', () => {
    const parser = new GenericOutputParser()
    const events = parser.feed('chat1', '> ')
    expect(events.some((e) => e.type === 'harness:waiting')).toBe(true)
  })
})

describe('createParser', () => {
  it('returns ClaudeOutputParser for claude', () => {
    expect(createParser('claude')).toBeInstanceOf(ClaudeOutputParser)
  })

  it('returns GenericOutputParser for unknown CLIs', () => {
    expect(createParser('unknown')).toBeInstanceOf(GenericOutputParser)
  })
})
