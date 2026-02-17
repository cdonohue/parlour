import type { Meta, StoryObj } from '@storybook/react'
import { ScheduleDetail } from './ScheduleDetail'
import type { Schedule } from '../../types'

const cronSchedule: Schedule = {
  id: 's1',
  name: 'Daily standup summary',
  prompt: 'Summarize git activity from the last 24 hours',
  trigger: { type: 'cron', cron: '0 9 * * 1-5' },
  enabled: true,
  createdAt: Date.now() - 86400_000,
}

const onceSchedule: Schedule = {
  id: 's2',
  name: 'Deploy reminder',
  prompt: 'Remind me to deploy the release',
  trigger: { type: 'once', at: new Date(Date.now() + 3600_000).toISOString() },
  enabled: true,
  createdAt: Date.now(),
}

const noop = () => {}

const meta: Meta<typeof ScheduleDetail> = {
  title: 'Components/ScheduleDetail',
  component: ScheduleDetail,
}
export default meta
type Story = StoryObj<typeof ScheduleDetail>

export const CronSchedule: Story = {
  args: { schedule: cronSchedule, onClose: noop, onToggle: noop, onDelete: noop },
}

export const OnceSchedule: Story = {
  args: { schedule: onceSchedule, onClose: noop, onToggle: noop, onDelete: noop },
}

export const Disabled: Story = {
  args: { schedule: { ...cronSchedule, enabled: false }, onClose: noop, onToggle: noop, onDelete: noop },
}
