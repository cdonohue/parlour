// ── Schedule — scheduled chat dispatch ──

export interface Schedule {
  id: string
  name: string
  prompt: string
  trigger: { type: 'cron'; cron: string } | { type: 'once'; at: string }
  project?: string
  createdBy?: string
  llmCommand?: string
  enabled: boolean
  createdAt: number
  lastRunAt?: number
  lastRunStatus?: 'success' | 'failed' | 'running'
}

export interface ProjectContext {
  name: string
  path: string
  branch?: string
  isGitRepo: boolean
  prInfo?: PrInfo
}

// ── Chat — the primary work primitive ──

export type ChatStatus = 'active' | 'idle' | 'done' | 'error'

export interface Chat {
  id: string
  name: string
  status: ChatStatus
  ptyId: string | null
  dirPath: string
  createdAt: number
  lastActiveAt: number
  pinnedAt: number | null
  parentId?: string
  llmCommand?: string
  projects?: ProjectContext[]
}

export type PrLinkProvider = 'github' | 'graphite' | 'devinreview'

export type HotkeyAction =
  | 'toggle-sidebar'
  | 'new-chat'
  | 'new-child-chat'
  | 'open-in-editor'
  | 'settings'
  | 'font-increase'
  | 'font-decrease'
  | 'font-reset'

export type Keybindings = Record<HotkeyAction, string>

export const DEFAULT_KEYBINDINGS: Keybindings = {
  'toggle-sidebar': 'Mod+B',
  'new-chat': 'Mod+N',
  'new-child-chat': 'Mod+Shift+N',
  'open-in-editor': 'Mod+O',

  'settings': 'Mod+,',
  'font-increase': 'Mod+=',
  'font-decrease': 'Mod+-',
  'font-reset': 'Mod+0',
}

export const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  'toggle-sidebar': 'Toggle sidebar',
  'new-chat': 'New chat',
  'new-child-chat': 'New child chat',
  'open-in-editor': 'Open in editor',

  'settings': 'Settings',
  'font-increase': 'Increase font size',
  'font-decrease': 'Decrease font size',
  'font-reset': 'Reset font size',
}

export interface Settings {
  defaultShell: string
  restoreLastChat: boolean
  terminalFontSize: number
  terminalFontFamily: string
  prLinkProvider: PrLinkProvider
  branchPrefix: string
  agingThresholdHours: number
  llmCommand: string
  lastOpenIn: string
  maxChatDepth: number
  keybindings: Keybindings
  projectRoots: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  defaultShell: '',
  restoreLastChat: true,
  terminalFontSize: 14,
  terminalFontFamily: 'Geist Mono',
  prLinkProvider: 'github',
  branchPrefix: '',
  agingThresholdHours: 24,
  llmCommand: 'claude',
  lastOpenIn: '',
  maxChatDepth: 2,
  keybindings: DEFAULT_KEYBINDINGS,
  projectRoots: [],
}

export interface Toast {
  id: string
  message: string
  type: 'error' | 'info'
}

export interface ConfirmDialogState {
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
}

export type PrState = 'open' | 'merged' | 'closed'

export type CheckStatus = 'pending' | 'passing' | 'failing' | 'none'

export interface PrInfo {
  number: number
  state: PrState
  title: string
  url: string
  checkStatus: CheckStatus
  updatedAt: string
}

// ── Time grouping helpers ──

export type TimeGroup = 'today' | 'yesterday' | 'this-week' | 'older'

export function getTimeGroup(timestamp: number): TimeGroup {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86_400_000
  const startOfWeek = startOfToday - now.getDay() * 86_400_000

  if (timestamp >= startOfToday) return 'today'
  if (timestamp >= startOfYesterday) return 'yesterday'
  if (timestamp >= startOfWeek) return 'this-week'
  return 'older'
}

export const TIME_GROUP_LABELS: Record<TimeGroup, string> = {
  'today': 'Today',
  'yesterday': 'Yesterday',
  'this-week': 'This Week',
  'older': 'Older',
}

