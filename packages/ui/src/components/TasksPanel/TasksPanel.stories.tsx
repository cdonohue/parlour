import type { Meta, StoryObj } from '@storybook/react'
import { TasksPanel } from './TasksPanel'
import type { Schedule } from '../../types'

const schedules: Schedule[] = [
  {
    id: 's1',
    name: 'Daily standup summary',
    prompt: 'Summarize git activity from the last 24 hours across all repos',
    trigger: { type: 'cron', cron: '0 9 * * 1-5' },
    enabled: true,
    createdAt: Date.now() - 86400_000 * 3,
    lastRunAt: Date.now() - 3600_000,
    lastRunStatus: 'success',
  },
  {
    id: 's2',
    name: 'Dependency audit',
    prompt: 'Check for outdated or vulnerable dependencies',
    trigger: { type: 'cron', cron: '0 0 * * 0' },
    enabled: true,
    createdAt: Date.now() - 86400_000 * 7,
  },
  {
    id: 's3',
    name: 'Deploy reminder',
    prompt: 'Remind to deploy staging',
    trigger: { type: 'once', at: new Date(Date.now() + 7200_000).toISOString() },
    enabled: false,
    createdAt: Date.now(),
  },
]

const noop = () => {}

const meta: Meta<typeof TasksPanel> = {
  title: 'Components/TasksPanel',
  component: TasksPanel,
  decorators: [(Story) => <div style={{ height: 600, background: 'var(--surface-0)' }}><Story /></div>],
}
export default meta
type Story = StoryObj<typeof TasksPanel>

export const WithSchedules: Story = {
  args: {
    schedules,
    defaultLlm: 'claude',
    onAdd: noop,
    onToggle: noop,
    onDelete: noop,
    onUpdate: noop,
    onRunNow: noop,
  },
}

export const Empty: Story = {
  args: {
    schedules: [],
    defaultLlm: 'claude',
    onAdd: noop,
    onToggle: noop,
    onDelete: noop,
    onUpdate: noop,
    onRunNow: noop,
  },
}
