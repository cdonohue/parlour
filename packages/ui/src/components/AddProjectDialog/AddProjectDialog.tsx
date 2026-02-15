import { useState, useCallback, useEffect } from 'react'
import { Button } from '../../primitives'
import styles from './AddProjectDialog.module.css'

interface AddProjectDialogProps {
  onConfirm: (name: string, repoPath: string) => void
  onCancel: () => void
  onBrowseDirectory: () => Promise<string | null>
  onCheckGitRepo?: (path: string) => Promise<boolean>
}

export function AddProjectDialog({ onConfirm, onCancel, onBrowseDirectory, onCheckGitRepo }: AddProjectDialogProps) {
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null)

  const deriveNameFromPath = (p: string): string => {
    const trimmed = p.replace(/\/+$/, '')
    return trimmed.split('/').pop() || ''
  }

  useEffect(() => {
    if (!path.trim() || !onCheckGitRepo) {
      setIsGitRepo(null)
      return
    }
    let cancelled = false
    onCheckGitRepo(path.trim()).then((result) => {
      if (!cancelled) setIsGitRepo(result)
    }).catch(() => {
      if (!cancelled) setIsGitRepo(null)
    })
    return () => { cancelled = true }
  }, [path, onCheckGitRepo])

  const handlePathChange = useCallback((value: string) => {
    setPath(value)
    setName(deriveNameFromPath(value))
  }, [])

  const handleBrowse = useCallback(async () => {
    const dir = await onBrowseDirectory()
    if (dir) {
      setPath(dir)
      setName(deriveNameFromPath(dir))
    }
  }, [onBrowseDirectory])

  const handleSubmit = useCallback(() => {
    if (path.trim()) onConfirm(name.trim() || deriveNameFromPath(path), path.trim())
  }, [name, path, onConfirm])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
    if (e.key === 'Escape') onCancel()
  }, [handleSubmit, onCancel])

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className={styles.title}>Add Project</div>

        <label className={styles.label}>Path</label>
        <div className={styles.pathRow}>
          <input
            className={styles.input}
            value={path}
            onChange={(e) => handlePathChange(e.target.value)}
            autoFocus
            placeholder="/path/to/project"
          />
          <Button variant="ghost" size="sm" onClick={handleBrowse}>Browse</Button>
        </div>
        {isGitRepo !== null && (
          <span className={styles.label} style={{ marginTop: 'calc(-1 * var(--space-2))' }}>
            {isGitRepo ? 'Git repository' : 'Plain folder'}
          </span>
        )}

        <label className={styles.label}>Name</label>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="project-name"
        />

        <div className={styles.actions}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!path.trim()}>Create</Button>
        </div>
      </div>
    </div>
  )
}
