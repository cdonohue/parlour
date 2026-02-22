import { create } from 'zustand'
import type { PlatformAdapter } from '@chorale/platform'
import type { Chat } from '@chorale/ui'
import type { AppState, PersistedState, ContentView } from './types'
import { DEFAULT_SETTINGS } from './types'

export type AppStore = ReturnType<typeof createAppStore>

// Set by initApp() before first render
export let useAppStore: AppStore = null as unknown as AppStore

export function initApp(adapter: PlatformAdapter): AppStore {
  useAppStore = createAppStore(adapter)
  return useAppStore
}

export function createAppStore(adapter: PlatformAdapter) {
  const store = create<AppState>((set, get) => ({
    chats: [],
    activeChatId: null,
    contentView: 'chat' as ContentView,
    sidebarCollapsed: false,
    settings: { ...DEFAULT_SETTINGS },
    settingsOpen: false,
    confirmDialog: null,
    toasts: [],
    newChatDialog: null,
    unreadChatIds: new Set<string>(),

    addChat: (chat, opts) =>
      set((s) => ({
        chats: [...s.chats, chat],
        ...(opts?.background ? {} : {
          activeChatId: chat.id,
          contentView: 'chat' as ContentView,
        }),
      })),

    removeChat: (id) =>
      set((s) => {
        const idsToRemove = new Set<string>()
        idsToRemove.add(id)
        let frontier = [id]
        while (frontier.length > 0) {
          const next: string[] = []
          for (const pid of frontier) {
            for (const c of s.chats) {
              if (c.parentId === pid && !idsToRemove.has(c.id)) {
                idsToRemove.add(c.id)
                next.push(c.id)
              }
            }
          }
          frontier = next
        }

        const newChats = s.chats.filter((c) => !idsToRemove.has(c.id))
        const newUnread = new Set(s.unreadChatIds)
        for (const cid of idsToRemove) newUnread.delete(cid)
        return {
          chats: newChats,
          unreadChatIds: newUnread,
          activeChatId: idsToRemove.has(s.activeChatId ?? '') ? (newChats.find((c) => !c.parentId)?.id ?? null) : s.activeChatId,
        }
      }),

    setActiveChat: (id) =>
      set((s) => {
        const newUnread = new Set(s.unreadChatIds)
        if (id) newUnread.delete(id)
        return {
          activeChatId: id,
          contentView: 'chat' as ContentView,
          unreadChatIds: newUnread,
        }
      }),

    updateChat: (id, partial) => {
      set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, ...partial } : c)) }))
      adapter.chatRegistry.update(id, partial as Record<string, unknown>)
    },

    pinChat: (id) => {
      const pinnedAt = Date.now()
      set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, pinnedAt } : c)) }))
      adapter.chatRegistry.update(id, { pinnedAt })
    },

    unpinChat: (id) => {
      set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, pinnedAt: null } : c)) }))
      adapter.chatRegistry.update(id, { pinnedAt: null })
    },

    touchChat: (id) => {
      const lastActiveAt = Date.now()
      set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, lastActiveAt, status: 'active' } : c)) }))
      adapter.chatRegistry.update(id, { lastActiveAt, status: 'active' })
    },

    deleteChat: async (chatId) => {
      await adapter.chatRegistry.delete(chatId)
    },

    createNewChat: async (opts) => {
      try {
        const result = await adapter.chatRegistry.create({
          llmCommand: opts?.llmCommand,
        })
        set({ activeChatId: (result as { chat: Chat }).chat.id, contentView: 'chat' as ContentView })
      } catch (err) {
        console.error('[createNewChat] failed:', err)
      }
    },

    createChildChat: async (parentId, opts) => {
      try {
        const result = await adapter.chatRegistry.createChild(parentId, {
          llmCommand: opts?.llmCommand,
        })
        set({ activeChatId: (result as { chat: Chat }).chat.id, contentView: 'chat' as ContentView })
      } catch (err) {
        if (err instanceof Error && err.message.includes('Max nesting depth')) {
          get().addToast({ id: crypto.randomUUID(), message: err.message, type: 'error' })
        } else {
          console.error('[createChildChat] failed:', err)
        }
      }
    },

    retitleChat: async (chatId) => {
      await adapter.chatRegistry.retitle(chatId)
    },

    resumeChat: async (chatId) => {
      await adapter.chatRegistry.resume(chatId)
    },

    openNewChatDialog: (state) => set({ newChatDialog: state }),
    closeNewChatDialog: () => set({ newChatDialog: null }),

    navigateToChat: (chatId) => {
      const s = get()
      const newUnread = new Set(s.unreadChatIds)
      newUnread.delete(chatId)
      set({
        activeChatId: chatId,
        contentView: 'chat' as ContentView,
        unreadChatIds: newUnread,
      })
    },

    toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

    updateSettings: (partial) =>
      set((s) => ({ settings: { ...s.settings, ...partial } })),

    toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
    toggleTasks: () => set((s) => ({ contentView: s.contentView === 'tasks' ? 'chat' as ContentView : 'tasks' as ContentView })),

    showConfirmDialog: (dialog) => set({ confirmDialog: dialog }),
    dismissConfirmDialog: () => set({ confirmDialog: null }),

    addToast: (toast) =>
      set((s) => ({ toasts: [...s.toasts, toast] })),

    dismissToast: (id) =>
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    markChatUnread: (chatId) =>
      set((s) => {
        if (s.unreadChatIds.has(chatId)) return s
        const newUnread = new Set(s.unreadChatIds)
        newUnread.add(chatId)
        return { unreadChatIds: newUnread }
      }),

    clearChatUnread: (chatId) =>
      set((s) => {
        if (!s.unreadChatIds.has(chatId)) return s
        const newUnread = new Set(s.unreadChatIds)
        newUnread.delete(chatId)
        return { unreadChatIds: newUnread }
      }),

    hydrateState: (data) => {
      const settings = data.settings ? { ...DEFAULT_SETTINGS, ...data.settings } : { ...DEFAULT_SETTINGS }

      let activeChatId = data.activeChatId ?? null
      if (!settings.restoreLastChat) {
        activeChatId = null
      }

      set({
        activeChatId,
        contentView: ((data.contentView as string) === 'automations' ? 'tasks' : data.contentView) ?? 'chat',
        settings,
      })
    },

    activeChat: () => {
      const s = get()
      return s.chats.find((c) => c.id === s.activeChatId)
    },

    getChildren: (parentId) => {
      return get().chats.filter((c) => c.parentId === parentId)
    },

    getChatDepth: (chatId) => {
      const chats = get().chats
      let depth = 0
      let current = chats.find((c) => c.id === chatId)
      while (current?.parentId) {
        depth++
        current = chats.find((c) => c.id === current!.parentId)
      }
      return depth
    },

    getChatAncestors: (chatId) => {
      const chats = get().chats
      const ancestors: typeof chats = []
      let current = chats.find((c) => c.id === chatId)
      while (current?.parentId) {
        const parent = chats.find((c) => c.id === current!.parentId)
        if (parent) ancestors.unshift(parent)
        current = parent
      }
      return ancestors
    },
  }))

  function getPersistedSlice(state: AppState): PersistedState {
    return {
      activeChatId: state.activeChatId,
      contentView: state.contentView,
      settings: state.settings,
    }
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  store.subscribe((state, prevState) => {
    if (
      state.activeChatId !== prevState.activeChatId ||
      state.contentView !== prevState.contentView ||
      state.settings !== prevState.settings
    ) {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        adapter.state.save(getPersistedSlice(state))
      }, 500)
    }

    if (state.settings.theme !== prevState.settings.theme) {
      adapter.theme.setMode(state.settings.theme)
      if (state.settings.theme !== 'system') {
        document.documentElement.setAttribute('data-theme', state.settings.theme === 'light' ? 'light' : '')
      }
    }
  })

  return store
}

export async function hydrateFromDisk(adapter: PlatformAdapter, store: AppStore): Promise<void> {
  try {
    const data = await adapter.state.load()
    if (data) {
      store.getState().hydrateState(data as PersistedState)
    }
  } catch (err) {
    console.error('Failed to load persisted state:', err)
  }

  try {
    const registryState = await adapter.chatRegistry.getState() as { chats: Chat[] }
    store.setState({
      chats: (registryState.chats ?? []) as Chat[],
    })
  } catch (err) {
    console.error('Failed to load chat registry state:', err)
  }

  adapter.chatRegistry.onStateChanged((state) => {
    const s = store.getState()
    const chatIds = new Set((state.chats as Chat[]).map((c: Chat) => c.id))
    const newUnread = new Set([...s.unreadChatIds].filter((id) => chatIds.has(id)))
    store.setState({
      chats: state.chats as Chat[],
      ...(s.activeChatId && !chatIds.has(s.activeChatId) ? { activeChatId: null } : {}),
      ...(newUnread.size !== s.unreadChatIds.size ? { unreadChatIds: newUnread } : {}),
    })
  })

  try {
    await adapter.pty.list()
  } catch (err) {
    console.error('Failed to reconcile PTYs:', err)
  }
}
