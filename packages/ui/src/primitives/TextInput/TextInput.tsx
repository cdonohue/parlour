import styles from './TextInput.module.css'

interface TextInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  fullWidth?: boolean
}

export function TextInput({ value, onChange, placeholder, fullWidth }: TextInputProps) {
  return (
    <input
      className={[styles.input, fullWidth && styles.fullWidth].filter(Boolean).join(' ')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}
