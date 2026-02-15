import styles from './NumberStepper.module.css'

interface NumberStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}

export function NumberStepper({ value, onChange, min = 8, max = 32 }: NumberStepperProps) {
  return (
    <div className={styles.stepper}>
      <button
        className={styles.btn}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
      >
        −
      </button>
      <span className={styles.value}>{value}</span>
      <button
        className={styles.btn}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
      >
        +
      </button>
    </div>
  )
}
