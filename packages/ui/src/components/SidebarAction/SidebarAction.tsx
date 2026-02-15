import type { ReactNode } from 'react'
import styles from './SidebarAction.module.css'

export interface SidebarActionProps {
  icon: ReactNode
  label: string
  shortcut?: string
  badge?: number
  bordered?: boolean
  inverted?: boolean
  onClick: (e?: React.MouseEvent) => void
}

export function SidebarAction({ icon, label, shortcut, badge, bordered, inverted, onClick }: SidebarActionProps) {
  const cls = [styles.action, bordered && styles.bordered, inverted && styles.inverted].filter(Boolean).join(' ')
  return (
    <button className={cls} onClick={(e) => onClick(e)}>
      <span className={styles.icon}>{icon}</span>
      <span>{label}</span>
      {badge != null && badge > 0 && <span className={styles.badge}>{badge}</span>}
      {shortcut && <span className={styles.shortcut}>{shortcut}</span>}
    </button>
  )
}
