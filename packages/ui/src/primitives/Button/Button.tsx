import type { ReactNode } from 'react'
import styles from './Button.module.css'

type ButtonVariant = 'ghost' | 'primary' | 'danger' | 'outline' | 'outlineDanger' | 'dashed'

interface ButtonProps {
  children: ReactNode
  onClick?: (e: React.MouseEvent) => void
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  disabled?: boolean
  fullWidth?: boolean
  autoFocus?: boolean
  type?: 'button' | 'submit'
}

export function Button({
  children,
  onClick,
  variant = 'ghost',
  size = 'md',
  disabled,
  fullWidth,
  autoFocus,
  type = 'button',
}: ButtonProps) {
  return (
    <button
      className={[styles.btn, styles[size], styles[variant], fullWidth && styles.fullWidth].filter(Boolean).join(' ')}
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      type={type}
    >
      {children}
    </button>
  )
}
