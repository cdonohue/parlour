import styles from './Toggle.module.css'

interface ToggleProps {
  value: boolean
  onChange: (value: boolean) => void
}

export function Toggle({ value, onChange }: ToggleProps) {
  return (
    <button
      className={`${styles.toggle} ${value ? styles.on : ''}`}
      onClick={() => onChange(!value)}
    >
      <span className={styles.knob} />
    </button>
  )
}
