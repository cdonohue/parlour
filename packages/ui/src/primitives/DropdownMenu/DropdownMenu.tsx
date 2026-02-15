import { useState, useRef, useEffect, useCallback } from 'react'
import styles from './DropdownMenu.module.css'

export interface DropdownMenuItem {
  id: string
  name: string
}

interface DropdownMenuProps {
  items: DropdownMenuItem[]
  onSelect: (id: string) => void
  children: (props: { open: (e: React.MouseEvent) => void }) => React.ReactNode
}

export function DropdownMenu({ items, onSelect, children }: DropdownMenuProps): React.ReactElement {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const open = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPos({ x: rect.right, y: rect.bottom + 4 })
  }, [])

  const close = useCallback(() => setPos(null), [])

  useEffect(() => {
    if (!pos) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      close()
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [pos, close])

  return (
    <>
      {children({ open })}
      {pos && (
        <div ref={menuRef} className={styles.menu} style={{ right: window.innerWidth - pos.x, top: pos.y }}>
          {items.map((item) => (
            <button
              key={item.id}
              className={styles.menuItem}
              onClick={() => { onSelect(item.id); close() }}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
