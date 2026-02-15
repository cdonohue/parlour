import { useState, useEffect } from 'react'
import type { Schedule } from '@parlour/ui'

export function useSchedules(): Schedule[] {
  const [schedules, setSchedules] = useState<Schedule[]>([])

  useEffect(() => {
    window.api.schedules.list().then(setSchedules)
    const unsub = window.api.schedules.onChanged(setSchedules as (s: unknown[]) => void)
    return unsub
  }, [])

  return schedules
}
