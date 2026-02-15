import { useState } from 'react'
import { X } from 'lucide-react'
import type { PrInfo, PrLinkProvider } from '../../types'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './SidebarItem.module.css'

export interface SidebarItemProps {
  name: string
  branch?: string
  active?: boolean
  unread?: boolean
  claudeActive?: boolean
  projectId: string
  prStatusMap: Map<string, PrInfo>
  ghAvailability: Map<string, boolean>
  prLinkProvider: PrLinkProvider
  onSelect: () => void
  onDelete: (e: React.MouseEvent) => void
  onRename: (name: string) => void
}

function WorkspaceMeta({
  projectId,
  branch,
  showBranch,
  prStatusMap,
  ghAvailability,
  prLinkProvider,
}: {
  projectId: string
  branch: string
  showBranch: boolean
  prStatusMap: Map<string, PrInfo>
  ghAvailability: Map<string, boolean>
  prLinkProvider: PrLinkProvider
}) {
  const prInfo = prStatusMap.get(`${projectId}:${branch}`)
  const ghAvailable = ghAvailability.get(projectId)
  const hasPr = !!(ghAvailable && prInfo !== undefined && prInfo !== null)

  if (!hasPr && !showBranch) return null

  const stateClass = hasPr ? styles[`pr_${prInfo!.state}`] || '' : ''

  return (
    <span className={styles.workspaceMeta}>
      {hasPr && (
        <span
          className={`${styles.prInline} ${stateClass}`}
          title={`PR #${prInfo!.number}: ${prInfo!.title}`}
          onClick={(e) => {
            e.stopPropagation()
            const domains: Record<string, string> = {
              github: 'github.com',
              graphite: 'graphite.dev',
              devinreview: 'devinreview.com',
            }
            const url = prInfo!.url.replace('github.com', domains[prLinkProvider] || 'github.com')
            window.open(url)
          }}
        >
          <span className={styles.prNumber}>#{prInfo!.number}</span>
        </span>
      )}
      {hasPr && showBranch && <span style={{ marginRight: 'var(--space-2)' }} />}
      {showBranch && branch}
    </span>
  )
}

export function SidebarItem({
  name,
  branch,
  active,
  unread,
  claudeActive,
  projectId,
  prStatusMap,
  ghAvailability,
  prLinkProvider,
  onSelect,
  onDelete,
  onRename,
}: SidebarItemProps) {
  const [editing, setEditing] = useState(false)

  const isAutoName = /^ws-[a-z0-9]+$/.test(name)
  const displayName = isAutoName && branch ? branch : name
  const showMeta = !isAutoName && branch && branch !== name

  return (
    <div
      className={`${styles.workspaceItem} ${active ? styles.active : ''} ${unread ? styles.unread : ''} ${claudeActive ? styles.claudeActive : ''}`}
      onClick={() => !editing && onSelect()}
      onDoubleClick={() => setEditing(true)}
    >
      {editing ? (
        <input
          className={styles.workspaceNameInput}
          defaultValue={displayName}
          autoFocus
          ref={(el) => {
            if (el) el.select()
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              setEditing(false)
            }
          }}
          onBlur={(e) => {
            const val = e.currentTarget.value.trim()
            if (val && val !== name) {
              onRename(val)
            }
            setEditing(false)
          }}
        />
      ) : (
        <span className={styles.workspaceName}>{displayName}</span>
      )}
      <Tooltip label="Delete workspace">
        <button
          className={styles.deleteBtn}
          onClick={onDelete}
        >
          <X size={11} />
        </button>
      </Tooltip>
      {branch && (
        <WorkspaceMeta
          projectId={projectId}
          branch={branch}
          showBranch={!!showMeta}
          prStatusMap={prStatusMap}
          ghAvailability={ghAvailability}
          prLinkProvider={prLinkProvider}
        />
      )}
    </div>
  )
}
