import { useState, useEffect } from 'react'
import type { Schedule } from '@parlour/ui'
import { usePlatform } from '@parlour/platform'

export function useSchedules(): Schedule[] {
  const platform = usePlatform()
  const [schedules, setSchedules] = useState<Schedule[]>([])

  useEffect(() => {
    platform.schedules.list().then((s) => setSchedules(s as Schedule[]))
    const unsub = platform.schedules.onChanged((s) => setSchedules(s as Schedule[]))
    return unsub
  }, [platform])

  return schedules
}
