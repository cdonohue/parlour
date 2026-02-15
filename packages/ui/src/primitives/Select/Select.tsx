import styles from './Select.module.css'

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}

export function Select({ value, onChange, options }: SelectProps) {
  return (
    <select
      className={styles.select}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
