import { useEffect, type ReactNode } from 'react'
import styles from './Dialog.module.css'

interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  width?: number
}

export function Dialog({ open, onClose, title, children, width }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        style={width ? { width } : undefined}
      >
        {title && (
          <div className={styles.header}>
            <div className={styles.title}>{title}</div>
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        )}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
