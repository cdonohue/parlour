import type { Schedule } from '../../types'
import { describeCron, describeOnce } from '../../utils/describe-cron'
import { Dialog } from '../../primitives/Dialog/Dialog'
import { FormRow } from '../../primitives/FormRow/FormRow'
import { Toggle } from '../../primitives/Toggle/Toggle'
import { Button } from '../../primitives/Button/Button'
import styles from './ScheduleDetail.module.css'

interface ScheduleDetailProps {
  schedule: Schedule | null
  onClose: () => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

function triggerDescription(trigger: Schedule['trigger']): string {
  return trigger.type === 'cron' ? describeCron(trigger.cron) : describeOnce(trigger.at)
}

export function ScheduleDetail({ schedule, onClose, onToggle, onDelete }: ScheduleDetailProps) {
  if (!schedule) return null

  return (
    <Dialog open={!!schedule} onClose={onClose} title={schedule.name} width={400}>
      <div className={styles.body}>
        <div className={styles.field}>
          <div className={styles.label}>Prompt</div>
          <div className={styles.prompt}>{schedule.prompt}</div>
        </div>

        <div className={styles.field}>
          <div className={styles.label}>Trigger</div>
          <div className={styles.trigger}>{triggerDescription(schedule.trigger)}</div>
        </div>

        <FormRow label="Enabled">
          <Toggle value={schedule.enabled} onChange={() => onToggle(schedule.id)} />
        </FormRow>

        <div className={styles.footer}>
          <Button variant="danger" fullWidth onClick={() => onDelete(schedule.id)}>
            Delete Schedule
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
