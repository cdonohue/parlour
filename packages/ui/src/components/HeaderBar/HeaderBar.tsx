import { Fragment } from 'react'
import { GitBranch, GitPullRequest, Folder, ChevronRight } from 'lucide-react'
import type { ProjectContext } from '../../types'
import { Tooltip } from '../Tooltip/Tooltip'
import { HStack, VStack } from '../../primitives/Stack/Stack'
import styles from './HeaderBar.module.css'

interface HeaderBarProps {
  title: string
  subtitle?: string
  breadcrumbs?: { label: string; onClick?: () => void }[]
  projects?: ProjectContext[]
  onOpenUrl?: (url: string) => void
  onOpen?: (path: string) => void
}

export function HeaderBar({ title, subtitle, breadcrumbs, projects, onOpenUrl, onOpen }: HeaderBarProps) {
  return (
    <VStack gap={0} className={styles.headerBar}>
      <HStack align="center">
        <HStack gap={4} align="center" flex="1">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <>
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className={styles.breadcrumb}>
                  <span
                    className={`${styles.breadcrumbText} ${crumb.onClick ? styles.breadcrumbClickable : ''}`}
                    onClick={crumb.onClick}
                  >
                    {crumb.label}
                  </span>
                </span>
              ))}
              <ChevronRight size={14} className={styles.breadcrumbSep} />
            </>
          )}
          <span className={styles.title}>{title}</span>
        </HStack>
      </HStack>
      {projects && projects.length > 0 && (
        <HStack gap={4} align="center" className={styles.linksRow}>
          {projects.map((p) => (
            <Fragment key={p.name}>
              <Tooltip label={p.branch ? `${p.name} · ${p.branch}` : p.name} position="bottom" onlyWhenOverflowing>
                <span
                  className={`${styles.linkPill} ${onOpen ? styles.linkPillClickable : ''}`}
                  onClick={onOpen ? () => onOpen(p.path) : undefined}
                >
                  {p.isGitRepo ? <GitBranch size={11} /> : <Folder size={11} />}
                  <span className={styles.linkRepo}>{p.name}</span>
                  {p.branch && <span className={styles.linkBranch}>{p.branch}</span>}
                </span>
              </Tooltip>
              {p.prInfo && (
                <Tooltip label={p.prInfo.url} position="bottom">
                  <span
                    className={`${styles.prPill} ${styles[`pr_${p.prInfo.state}`] || ''}`}
                    onClick={() => onOpenUrl?.(p.prInfo!.url)}
                  >
                    <GitPullRequest size={11} />
                    #{p.prInfo.number}
                  </span>
                </Tooltip>
              )}
            </Fragment>
          ))}
        </HStack>
      )}
    </VStack>
  )
}
