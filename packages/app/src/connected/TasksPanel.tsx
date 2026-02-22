import { useCallback } from 'react'
import { TasksPanel as TasksPanelUI } from '@chorale/ui'
import { usePlatform } from '@chorale/platform'
import { useAppStore } from '../store/app-store'
import { resolveLlmCommand } from '../store/types'
import { useSchedules } from '../hooks/useSchedules'

export function TasksPanel() {
  const platform = usePlatform()
  const schedules = useSchedules()
  const llmCommand = resolveLlmCommand(useAppStore((s) => s.settings))

  const handleGenerateCron = useCallback(async (description: string): Promise<string | null> => {
    const prompt = `Convert this schedule description to a cron expression (5 fields: minute hour day-of-month month day-of-week). Reply with ONLY the cron expression, nothing else: "${description}"`
    const result = await platform.shell.runCommand(
      `${llmCommand} --print "${prompt.replace(/"/g, '\\"')}"`,
      '/',
    )
    if (!result.success) return null
    const cleaned = result.output.replace(/`/g, '').trim()
    const cronRe = /^([\d*,/\-#LW]+(?:\s+[\d*,/\-#LW]+){4})$/m
    const match = cleaned.match(cronRe)
    if (!match) return null
    return match[1]
  }, [llmCommand, platform])

  const handleAdd = useCallback(() => {
    platform.schedules.create({
      name: 'New task',
      prompt: '',
      trigger: { type: 'cron', cron: '0 9 * * *' },
      enabled: false,
    })
  }, [platform])

  return (
    <TasksPanelUI
      schedules={schedules}
      defaultLlm={llmCommand}
      onAdd={handleAdd}
      onToggle={(id) => platform.schedules.toggle(id)}
      onDelete={(id) => platform.schedules.delete(id)}
      onUpdate={(id, partial) => platform.schedules.update(id, partial)}
      onRunNow={(id) => platform.schedules.runNow(id)}
      onGenerateCron={handleGenerateCron}
    />
  )
}
