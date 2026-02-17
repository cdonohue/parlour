export type {
  Chat,
  ChatStatus,
  ProjectContext,
  PrLinkProvider,
  Settings,
  Toast,
  ConfirmDialogState,
  PrState,
  CheckStatus,
  PrInfo,
  TimeGroup,
} from '@parlour/ui'

export { DEFAULT_SETTINGS, getTimeGroup, TIME_GROUP_LABELS } from '@parlour/ui'

import type { Chat, Settings, Toast, ConfirmDialogState } from '@parlour/ui'

export function resolveLlmCommand(settings: { llmCommand: string }, ...overrides: (string | undefined | null)[]): string {
  for (const o of overrides) {
    if (o) return o
  }
  return settings.llmCommand || 'claude'
}

export type ContentView = 'chat' | 'tasks'

export interface AppState {
  // Data
  chats: Chat[]

  // Navigation
  activeChatId: string | null
  contentView: ContentView

  // UI
  sidebarCollapsed: boolean
  settings: Settings
  settingsOpen: boolean
  confirmDialog: ConfirmDialogState | null
  toasts: Toast[]
  newChatDialog: { mode: 'new' } | { mode: 'child'; parentId: string } | null
  unreadChatIds: Set<string>

  // Chat actions
  addChat: (chat: Chat, opts?: { background?: boolean }) => void
  removeChat: (id: string) => void
  setActiveChat: (id: string | null) => void
  updateChat: (id: string, partial: Partial<Omit<Chat, 'id'>>) => void
  pinChat: (id: string) => void
  unpinChat: (id: string) => void
  touchChat: (id: string) => void
  deleteChat: (chatId: string) => Promise<void>
  createNewChat: (opts?: { llmCommand?: string }) => Promise<void>
  createChildChat: (parentId: string, opts?: { llmCommand?: string }) => Promise<void>
  retitleChat: (chatId: string) => Promise<void>
  resumeChat: (chatId: string) => Promise<void>
  openNewChatDialog: (state: NonNullable<AppState['newChatDialog']>) => void
  closeNewChatDialog: () => void

  // Navigation
  navigateToChat: (chatId: string) => void

  // Panel / UI
  toggleSidebar: () => void
  updateSettings: (partial: Partial<Settings>) => void
  toggleSettings: () => void
  toggleTasks: () => void
  showConfirmDialog: (dialog: ConfirmDialogState) => void
  dismissConfirmDialog: () => void
  addToast: (toast: Toast) => void
  dismissToast: (id: string) => void

  // Unread / activity
  markChatUnread: (chatId: string) => void
  clearChatUnread: (chatId: string) => void

  // Hydration
  hydrateState: (data: PersistedState) => void

  // Derived
  activeChat: () => Chat | undefined
  getChildren: (parentId: string) => Chat[]
  getChatDepth: (chatId: string) => number
  getChatAncestors: (chatId: string) => Chat[]
}

export interface PersistedState {
  activeChatId?: string | null
  contentView?: ContentView
  settings?: Settings
}
