import type { ReactNode } from 'react'
import styles from './IconButton.module.css'

interface IconButtonProps {
  icon: ReactNode
  onClick: (e: React.MouseEvent) => void
  title?: string
  size?: 'sm' | 'md'
  variant?: 'default' | 'danger'
  disabled?: boolean
}

export function IconButton({ icon, onClick, title, size = 'md', variant = 'default', disabled }: IconButtonProps) {
  return (
    <button
      className={`${styles.btn} ${styles[size]} ${styles[variant]}`}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {icon}
    </button>
  )
}
