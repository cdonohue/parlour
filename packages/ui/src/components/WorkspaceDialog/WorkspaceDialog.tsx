import { useState, useEffect, useCallback, useRef } from 'react'
import type { Project } from '../../types'
import { Button } from '../../primitives'
import styles from './WorkspaceDialog.module.css'

function toKebab(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

interface WorkspaceDialogProps {
  project: Project
  branchPrefix?: string
  onConfirm: (name: string, branch: string, newBranch: boolean, baseBranch?: string) => void
  onCancel: () => void
  getBranches: (repoPath: string) => Promise<string[]>
}

export function WorkspaceDialog({ project, branchPrefix = '', onConfirm, onCancel, getBranches }: WorkspaceDialogProps) {
  const [name, setName] = useState('')
  const [branches, setBranches] = useState<string[]>([])
  const [selectedBranch, setSelectedBranch] = useState('main')
  const [baseBranch, setBaseBranch] = useState('main')
  const [isNewBranch, setIsNewBranch] = useState(true)
  const [branchEdited, setBranchEdited] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [basePickerOpen, setBasePickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const basePickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getBranches(project.repoPath).then((b) => {
      setBranches(b)
      if (b.length > 0 && !b.includes('main')) {
        setSelectedBranch(b[0])
        setBaseBranch(b[0])
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [project.repoPath, getBranches])

  const derivedBranch = branchPrefix + toKebab(name)

  const handleSubmit = useCallback(() => {
    const branch = isNewBranch ? (branchEdited ? newBranchName : derivedBranch) : selectedBranch
    onConfirm(name, branch, isNewBranch, isNewBranch ? baseBranch : undefined)
  }, [name, isNewBranch, branchEdited, newBranchName, derivedBranch, selectedBranch, baseBranch, onConfirm])

  useEffect(() => {
    if (!pickerOpen && !basePickerOpen) return
    const handler = (e: MouseEvent) => {
      if (pickerOpen && pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
      if (basePickerOpen && basePickerRef.current && !basePickerRef.current.contains(e.target as Node)) {
        setBasePickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen, basePickerOpen])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
    if (e.key === 'Escape') onCancel()
  }, [handleSubmit, onCancel])

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className={styles.title}>New Session</div>

        <label className={styles.label}>Name</label>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          placeholder="session-name"
        />

        <label className={styles.label}>Branch</label>
        <div className={styles.branchToggle}>
          <button
            className={`${styles.toggleBtn} ${isNewBranch ? styles.active : ''}`}
            onClick={() => setIsNewBranch(true)}
          >
            New branch
          </button>
          <button
            className={`${styles.toggleBtn} ${!isNewBranch ? styles.active : ''}`}
            onClick={() => setIsNewBranch(false)}
          >
            Existing
          </button>
        </div>

        {isNewBranch ? (
          <>
            <input
              className={styles.input}
              value={branchEdited ? newBranchName : ''}
              onChange={(e) => { setBranchEdited(true); setNewBranchName(e.target.value) }}
              placeholder={derivedBranch || 'branch-name'}
            />

            <label className={styles.label}>Base branch</label>
            <div className={styles.branchInputRow} ref={basePickerRef}>
              <input
                className={styles.input}
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                disabled={loading}
                placeholder="main"
              />
              <button
                className={styles.pickerBtn}
                onClick={() => setBasePickerOpen((v) => !v)}
                disabled={loading}
                type="button"
              >
                &#9662;
              </button>
              {basePickerOpen && (
                <div className={styles.pickerDropdown}>
                  {branches.map((b) => (
                    <div
                      key={b}
                      className={`${styles.pickerOption} ${b === baseBranch ? styles.pickerOptionActive : ''}`}
                      onClick={() => { setBaseBranch(b); setBasePickerOpen(false) }}
                    >
                      {b}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className={styles.branchInputRow} ref={pickerRef}>
            <input
              className={styles.input}
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              disabled={loading}
              placeholder="Branch name"
            />
            <button
              className={styles.pickerBtn}
              onClick={() => setPickerOpen((v) => !v)}
              disabled={loading}
              type="button"
            >
              &#9662;
            </button>
            {pickerOpen && (
              <div className={styles.pickerDropdown}>
                {branches.map((b) => (
                  <div
                    key={b}
                    className={`${styles.pickerOption} ${b === selectedBranch ? styles.pickerOptionActive : ''}`}
                    onClick={() => { setSelectedBranch(b); setPickerOpen(false) }}
                  >
                    {b}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={styles.actions}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!name.trim()}>Create</Button>
        </div>
      </div>
    </div>
  )
}
