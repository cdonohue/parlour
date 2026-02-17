import type { HarnessStatus } from './events'

export interface DispatchRequest {
  prompt: string
  parent_chat_id?: string
  llm?: string
  project?: string
  branch?: string
}

export interface DispatchResponse {
  chatId: string
  chatDir: string
}

export interface HarnessState {
  status: HarnessStatus
  currentTool?: string
  lastActivity: number
  toolsUsed: number
}

export interface StatusResponse {
  status: string
  name: string
  harness: HarnessState | null
  output: string
}

export interface ChildInfo {
  id: string
  name: string
  status: string
}

export interface ScheduleInfo {
  id: string
  name: string
  prompt: string
  trigger: unknown
  enabled: boolean
  lastRunAt: string | null
  lastRunStatus: string | null
}

export interface CreateScheduleRequest {
  prompt: string
  cron?: string
  at?: string
}

export interface CreateScheduleResponse {
  id: string
  name: string
}

export interface ProjectInfo {
  name: string
  path: string
  branch?: string
}

export interface OpenProjectRequest {
  chat_id: string
  path_or_url: string
  branch?: string
  base?: string
}

export interface ReportRequest {
  chat_id: string
  parent_id: string
  message: string
}

export interface HookRequest {
  chat_id?: string
  event: string
  data?: Record<string, unknown>
}
