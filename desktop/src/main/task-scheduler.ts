import { Cron } from 'croner'
import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { ChatRegistry } from './chat-registry'
import { PARLOUR_DIR } from './parlour-dirs'

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

const SCHEDULES_FILE = join(PARLOUR_DIR, 'schedules.json')

export class TaskScheduler {
  private schedules = new Map<string, Schedule>()
  private jobs = new Map<string, Cron>()
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>()
  private chatRegistry: ChatRegistry
  private settingsGetter: () => { llmCommand: string }

  constructor(chatRegistry: ChatRegistry, settingsGetter: () => { llmCommand: string }) {
    this.chatRegistry = chatRegistry
    this.settingsGetter = settingsGetter
  }

  async loadAndStart(): Promise<void> {
    try {
      const raw = await readFile(SCHEDULES_FILE, 'utf-8')
      const arr: Schedule[] = JSON.parse(raw)
      let dirty = false
      for (const s of arr) {
        if (s.lastRunStatus === 'running') {
          s.lastRunStatus = 'failed'
          dirty = true
        }
        this.schedules.set(s.id, s)
        if (s.enabled) this.startJob(s)
      }
      if (dirty) this.save()
    } catch {
    }
  }

  create(opts: { name: string; prompt: string; trigger: Schedule['trigger']; project?: string; createdBy?: string; llmCommand?: string; enabled?: boolean }): Schedule {
    const schedule: Schedule = {
      id: crypto.randomUUID().slice(0, 8),
      name: opts.name,
      prompt: opts.prompt,
      trigger: opts.trigger,
      project: opts.project || undefined,
      createdBy: opts.createdBy || undefined,
      llmCommand: opts.llmCommand || undefined,
      enabled: opts.enabled ?? true,
      createdAt: Date.now(),
    }
    this.schedules.set(schedule.id, schedule)
    if (schedule.enabled) this.startJob(schedule)
    this.save()
    this.pushToRenderer()
    return schedule
  }

  delete(id: string): void {
    this.stopJob(id)
    this.schedules.delete(id)
    this.save()
    this.pushToRenderer()
  }

  update(id: string, partial: { name?: string; prompt?: string; project?: string; trigger?: Schedule['trigger']; llmCommand?: string }): void {
    const s = this.schedules.get(id)
    if (!s) return
    if (partial.name !== undefined) s.name = partial.name
    if (partial.prompt !== undefined) s.prompt = partial.prompt
    if (partial.project !== undefined) s.project = partial.project || undefined
    if (partial.llmCommand !== undefined) s.llmCommand = partial.llmCommand || undefined
    if (partial.trigger !== undefined) {
      s.trigger = partial.trigger
      if (s.enabled) this.startJob(s)
    }
    this.save()
    this.pushToRenderer()
  }

  toggle(id: string): boolean {
    const s = this.schedules.get(id)
    if (!s) return false
    if (!s.enabled && !s.prompt.trim()) return false
    s.enabled = !s.enabled
    if (s.enabled) this.startJob(s)
    else this.stopJob(id)
    this.save()
    this.pushToRenderer()
    return true
  }

  runNow(id: string): void {
    const s = this.schedules.get(id)
    if (!s || !s.prompt.trim()) return
    this.execute(s)
  }

  list(): Schedule[] {
    return Array.from(this.schedules.values())
  }

  destroyAll(): void {
    for (const [id] of this.jobs) this.stopJob(id)
    for (const [id] of this.timeouts) {
      clearTimeout(this.timeouts.get(id)!)
      this.timeouts.delete(id)
    }
  }

  private startJob(schedule: Schedule): void {
    this.stopJob(schedule.id)

    if (schedule.trigger.type === 'cron') {
      const job = new Cron(schedule.trigger.cron, () => {
        this.execute(schedule)
      })
      this.jobs.set(schedule.id, job)
    } else {
      const delay = new Date(schedule.trigger.at).getTime() - Date.now()
      if (delay <= 0) {
        this.execute(schedule)
        return
      }
      const timer = setTimeout(() => {
        this.timeouts.delete(schedule.id)
        this.execute(schedule)
      }, delay)
      this.timeouts.set(schedule.id, timer)
    }
  }

  private stopJob(id: string): void {
    const job = this.jobs.get(id)
    if (job) {
      job.stop()
      this.jobs.delete(id)
    }
    const timer = this.timeouts.get(id)
    if (timer) {
      clearTimeout(timer)
      this.timeouts.delete(id)
    }
  }

  private async execute(schedule: Schedule): Promise<void> {
    schedule.lastRunAt = Date.now()
    schedule.lastRunStatus = 'running'
    this.save()
    this.pushToRenderer()

    await this.chatRegistry.createChat({
      name: schedule.name,
      llmCommand: schedule.llmCommand || this.settingsGetter().llmCommand,
      project: schedule.project ? { pathOrUrl: schedule.project } : undefined,
      prompt: schedule.prompt,
      background: true,
      onExit: (exitCode) => {
        schedule.lastRunStatus = exitCode === 0 ? 'success' : 'failed'
        if (schedule.trigger.type === 'once') {
          this.delete(schedule.id)
        } else {
          this.save()
          this.pushToRenderer()
        }
      },
    })
  }

  private pushToRenderer(): void {
    const all = this.list()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.SCHEDULE_CHANGED, all)
      }
    }
  }

  private async save(): Promise<void> {
    try {
      await mkdir(PARLOUR_DIR, { recursive: true })
      await writeFile(SCHEDULES_FILE, JSON.stringify(this.list(), null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save schedules:', err)
    }
  }
}
