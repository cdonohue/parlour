import { forwardRef } from 'react'
import styles from './TextInput.module.css'

interface TextInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  fullWidth?: boolean
  autoFocus?: boolean
  disabled?: boolean
  spellCheck?: boolean
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onBlur?: () => void
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { value, onChange, placeholder, fullWidth, autoFocus, disabled, spellCheck, onKeyDown, onBlur },
  ref,
) {
  return (
    <input
      ref={ref}
      className={[styles.input, fullWidth && styles.fullWidth].filter(Boolean).join(' ')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      spellCheck={spellCheck}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    />
  )
})
