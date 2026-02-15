import type { ReactNode } from 'react'
import styles from './FormRow.module.css'

interface FormRowProps {
  label: string
  description?: string
  children: ReactNode
  onClick?: () => void
}

export function FormRow({ label, description, children, onClick }: FormRowProps) {
  return (
    <div className={styles.row} onClick={onClick}>
      <div className={styles.text}>
        <div className={styles.label}>{label}</div>
        {description && <div className={styles.description}>{description}</div>}
      </div>
      {children}
    </div>
  )
}
