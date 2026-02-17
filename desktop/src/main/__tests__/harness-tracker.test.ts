import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../lifecycle', () => ({
  lifecycle: { emit: vi.fn(), on: vi.fn(() => () => {}) },
}))

import { HarnessTracker } from '../harness-tracker'
import { lifecycle } from '../lifecycle'

describe('HarnessTracker', () => {
  let tracker: HarnessTracker

  beforeEach(() => {
    vi.clearAllMocks()
    tracker = new HarnessTracker('chat1')
  })

  it('starts in idle state', () => {
    const state = tracker.getState()
    expect(state.status).toBe('idle')
    expect(state.toolsUsed).toBe(0)
    expect(state.currentTool).toBeUndefined()
  })

  it('transitions to tool-use on tool:start', () => {
    tracker.handleEvent({ type: 'harness:tool:start', chatId: 'chat1', tool: 'Read' })
    const state = tracker.getState()
    expect(state.status).toBe('tool-use')
    expect(state.currentTool).toBe('Read')
    expect(state.toolsUsed).toBe(1)
  })

  it('transitions to writing on tool:end', () => {
    tracker.handleEvent({ type: 'harness:tool:start', chatId: 'chat1', tool: 'Edit' })
    tracker.handleEvent({ type: 'harness:tool:end', chatId: 'chat1', tool: 'Edit' })
    const state = tracker.getState()
    expect(state.status).toBe('writing')
    expect(state.currentTool).toBeUndefined()
  })

  it('transitions to thinking', () => {
    tracker.handleEvent({ type: 'harness:thinking', chatId: 'chat1' })
    expect(tracker.getState().status).toBe('thinking')
  })

  it('transitions to waiting', () => {
    tracker.handleEvent({ type: 'harness:waiting', chatId: 'chat1' })
    expect(tracker.getState().status).toBe('waiting')
  })

  it('transitions to done on stop', () => {
    tracker.handleEvent({ type: 'harness:tool:start', chatId: 'chat1', tool: 'Bash' })
    tracker.handleEvent({ type: 'harness:stop', chatId: 'chat1', reason: 'cost-summary' })
    const state = tracker.getState()
    expect(state.status).toBe('done')
    expect(state.currentTool).toBeUndefined()
  })

  it('counts tools used across multiple tool starts', () => {
    tracker.handleEvent({ type: 'harness:tool:start', chatId: 'chat1', tool: 'Read' })
    tracker.handleEvent({ type: 'harness:tool:end', chatId: 'chat1', tool: 'Read' })
    tracker.handleEvent({ type: 'harness:tool:start', chatId: 'chat1', tool: 'Edit' })
    tracker.handleEvent({ type: 'harness:tool:end', chatId: 'chat1', tool: 'Edit' })
    tracker.handleEvent({ type: 'harness:tool:start', chatId: 'chat1', tool: 'Bash' })
    expect(tracker.getState().toolsUsed).toBe(3)
  })

  it('emits harness:status on state change', () => {
    tracker.handleEvent({ type: 'harness:thinking', chatId: 'chat1' })
    expect(lifecycle.emit).toHaveBeenCalledWith({
      type: 'harness:status',
      chatId: 'chat1',
      status: 'thinking',
      tool: undefined,
    })
  })

  it('does not emit when status unchanged', () => {
    tracker.handleEvent({ type: 'harness:thinking', chatId: 'chat1' })
    vi.clearAllMocks()
    tracker.handleEvent({ type: 'harness:thinking', chatId: 'chat1' })
    expect(lifecycle.emit).not.toHaveBeenCalled()
  })

  it('markDone sets status to done', () => {
    tracker.handleEvent({ type: 'harness:tool:start', chatId: 'chat1', tool: 'Read' })
    tracker.markDone()
    expect(tracker.getState().status).toBe('done')
    expect(tracker.getState().currentTool).toBeUndefined()
  })

  it('markError sets status to error', () => {
    tracker.markError()
    expect(tracker.getState().status).toBe('error')
  })

  it('getState returns a copy', () => {
    const s1 = tracker.getState()
    tracker.handleEvent({ type: 'harness:thinking', chatId: 'chat1' })
    const s2 = tracker.getState()
    expect(s1.status).toBe('idle')
    expect(s2.status).toBe('thinking')
  })
})
