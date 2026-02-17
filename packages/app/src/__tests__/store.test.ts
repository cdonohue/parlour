import { describe, it, expect, beforeEach } from 'vitest'
import { createAppStore } from '../store/app-store'
import type { AppStore } from '../store/app-store'
import { createMockAdapter } from '../../../platform/src/testing/mock-adapter'

let store: AppStore

beforeEach(() => {
  store = createAppStore(createMockAdapter())
})

describe('createAppStore', () => {
  it('initializes with default state', () => {
    const s = store.getState()
    expect(s.chats).toEqual([])
    expect(s.activeChatId).toBeNull()
    expect(s.contentView).toBe('chat')
    expect(s.sidebarCollapsed).toBe(false)
    expect(s.settingsOpen).toBe(false)
    expect(s.toasts).toEqual([])
  })

  it('addChat adds a chat and sets it active', () => {
    const chat = { id: 'c1', name: 'Test', status: 'active' as const, lastActiveAt: Date.now(), createdAt: Date.now(), projects: [] }
    store.getState().addChat(chat as any)
    const s = store.getState()
    expect(s.chats).toHaveLength(1)
    expect(s.activeChatId).toBe('c1')
    expect(s.contentView).toBe('chat')
  })

  it('addChat with background does not set active', () => {
    const chat = { id: 'c1', name: 'Test', status: 'active' as const, lastActiveAt: Date.now(), createdAt: Date.now(), projects: [] }
    store.getState().addChat(chat as any, { background: true })
    const s = store.getState()
    expect(s.chats).toHaveLength(1)
    expect(s.activeChatId).toBeNull()
  })

  it('removeChat removes chat and its children', () => {
    const parent = { id: 'p1', name: 'Parent', status: 'active' as const, lastActiveAt: Date.now(), createdAt: Date.now(), projects: [] }
    const child = { id: 'c1', name: 'Child', parentId: 'p1', status: 'active' as const, lastActiveAt: Date.now(), createdAt: Date.now(), projects: [] }
    store.getState().addChat(parent as any)
    store.getState().addChat(child as any)
    expect(store.getState().chats).toHaveLength(2)

    store.getState().removeChat('p1')
    expect(store.getState().chats).toHaveLength(0)
  })

  it('setActiveChat updates activeChatId and clears unread', () => {
    store.setState({ unreadChatIds: new Set(['c1']) })
    store.getState().setActiveChat('c1')
    expect(store.getState().activeChatId).toBe('c1')
    expect(store.getState().unreadChatIds.has('c1')).toBe(false)
  })

  it('toggleSidebar flips sidebarCollapsed', () => {
    expect(store.getState().sidebarCollapsed).toBe(false)
    store.getState().toggleSidebar()
    expect(store.getState().sidebarCollapsed).toBe(true)
    store.getState().toggleSidebar()
    expect(store.getState().sidebarCollapsed).toBe(false)
  })

  it('updateSettings merges partial settings', () => {
    const original = store.getState().settings.terminalFontSize
    store.getState().updateSettings({ terminalFontSize: 20 })
    expect(store.getState().settings.terminalFontSize).toBe(20)
    expect(store.getState().settings.theme).toBe(store.getState().settings.theme)
  })

  it('toggleSettings flips settingsOpen', () => {
    store.getState().toggleSettings()
    expect(store.getState().settingsOpen).toBe(true)
    store.getState().toggleSettings()
    expect(store.getState().settingsOpen).toBe(false)
  })

  it('toggleTasks switches between chat and tasks', () => {
    expect(store.getState().contentView).toBe('chat')
    store.getState().toggleTasks()
    expect(store.getState().contentView).toBe('tasks')
    store.getState().toggleTasks()
    expect(store.getState().contentView).toBe('chat')
  })

  it('addToast and dismissToast manage toasts', () => {
    store.getState().addToast({ id: 't1', message: 'Hello', type: 'info' })
    expect(store.getState().toasts).toHaveLength(1)
    store.getState().dismissToast('t1')
    expect(store.getState().toasts).toHaveLength(0)
  })

  it('markChatUnread and clearChatUnread toggle unread', () => {
    store.getState().markChatUnread('c1')
    expect(store.getState().unreadChatIds.has('c1')).toBe(true)
    store.getState().clearChatUnread('c1')
    expect(store.getState().unreadChatIds.has('c1')).toBe(false)
  })

  it('navigateToChat sets active and clears unread', () => {
    store.setState({ unreadChatIds: new Set(['c2']) })
    store.getState().navigateToChat('c2')
    expect(store.getState().activeChatId).toBe('c2')
    expect(store.getState().contentView).toBe('chat')
    expect(store.getState().unreadChatIds.has('c2')).toBe(false)
  })

  it('openNewChatDialog and closeNewChatDialog', () => {
    store.getState().openNewChatDialog({ mode: 'new' })
    expect(store.getState().newChatDialog).toEqual({ mode: 'new' })
    store.getState().closeNewChatDialog()
    expect(store.getState().newChatDialog).toBeNull()
  })

  it('hydrateState restores persisted data', () => {
    store.getState().hydrateState({
      activeChatId: 'c1',
      contentView: 'tasks',
      settings: { terminalFontSize: 18 } as any,
    })
    const s = store.getState()
    expect(s.activeChatId).toBe('c1')
    expect(s.contentView).toBe('tasks')
    expect(s.settings.terminalFontSize).toBe(18)
  })

  it('getChatDepth returns correct depth', () => {
    const root = { id: 'r', name: 'Root', status: 'active' as const, lastActiveAt: Date.now(), createdAt: Date.now(), projects: [] }
    const child = { id: 'c', name: 'Child', parentId: 'r', status: 'active' as const, lastActiveAt: Date.now(), createdAt: Date.now(), projects: [] }
    const grandchild = { id: 'g', name: 'Grandchild', parentId: 'c', status: 'active' as const, lastActiveAt: Date.now(), createdAt: Date.now(), projects: [] }
    store.getState().addChat(root as any, { background: true })
    store.getState().addChat(child as any, { background: true })
    store.getState().addChat(grandchild as any, { background: true })

    expect(store.getState().getChatDepth('r')).toBe(0)
    expect(store.getState().getChatDepth('c')).toBe(1)
    expect(store.getState().getChatDepth('g')).toBe(2)
  })
})
