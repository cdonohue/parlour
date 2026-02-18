import { useState, useEffect } from 'react'
import type { Schedule } from '@parlour/ui'
import { usePlatform } from '@parlour/platform'

export function useSchedules(): Schedule[] {
  const platform = usePlatform()
  const [schedules, setSchedules] = useState<Schedule[]>([])

  useEffect(() => {
    platform.schedules.list().then(setSchedules)
    const unsub = platform.schedules.onChanged(setSchedules as (s: unknown[]) => void)
    return unsub
  }, [platform])

  return schedules
}
