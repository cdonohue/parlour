import { execFile } from 'child_process'
import { promisify } from 'util'
import type { PrInfo, PrLookupResult, CheckStatus, PrState } from '@chorale/api-types'

const execFileAsync = promisify(execFile)

type ForgeType = 'github' | 'gitlab'

export class ForgeService {
  private static ghAvailable: boolean | null = null
  private static glabAvailable: boolean | null = null
  private static forgeCache = new Map<string, ForgeType | null>()
  private static prCache = new Map<string, { data: PrInfo | null; ts: number }>()
  private static CACHE_TTL = 60_000

  static async detectForge(repoPath: string): Promise<ForgeType | null> {
    const cached = this.forgeCache.get(repoPath)
    if (cached !== undefined) return cached
    try {
      const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
        cwd: repoPath,
        timeout: 5000,
      })
      let forge: ForgeType | null = null
      if (stdout.includes('github.com')) forge = 'github'
      else if (stdout.includes('gitlab.com') || stdout.includes('gitlab')) forge = 'gitlab'
      this.forgeCache.set(repoPath, forge)
      return forge
    } catch {
      this.forgeCache.set(repoPath, null)
      return null
    }
  }

  static async isGhAvailable(): Promise<boolean> {
    if (this.ghAvailable !== null) return this.ghAvailable
    try {
      await execFileAsync('gh', ['--version'], { timeout: 5000 })
      this.ghAvailable = true
    } catch {
      this.ghAvailable = false
    }
    return this.ghAvailable
  }

  static async isGlabAvailable(): Promise<boolean> {
    if (this.glabAvailable !== null) return this.glabAvailable
    try {
      await execFileAsync('glab', ['--version'], { timeout: 5000 })
      this.glabAvailable = true
    } catch {
      this.glabAvailable = false
    }
    return this.glabAvailable
  }

  static async getPrStatuses(repoPath: string, branches: string[]): Promise<PrLookupResult> {
    const forge = await this.detectForge(repoPath)
    if (!forge) return { available: false, error: 'not_github_repo', data: {} }

    if (forge === 'github') {
      if (!(await this.isGhAvailable())) return { available: false, error: 'gh_not_installed', data: {} }
    } else {
      if (!(await this.isGlabAvailable())) return { available: false, error: 'gh_not_installed', data: {} }
    }

    const now = Date.now()
    const result: Record<string, PrInfo | null> = {}
    const uncached: string[] = []

    for (const branch of branches) {
      const key = `${repoPath}:${branch}`
      const cached = this.prCache.get(key)
      if (cached && now - cached.ts < this.CACHE_TTL) {
        result[branch] = cached.data
      } else {
        uncached.push(branch)
      }
    }

    const fetchFn = forge === 'github'
      ? (b: string) => this.fetchGithubPrForBranch(repoPath, b)
      : (b: string) => this.fetchGitlabMrForBranch(repoPath, b)

    const settled = await Promise.allSettled(uncached.map(fetchFn))

    for (let i = 0; i < uncached.length; i++) {
      const branch = uncached[i]
      const key = `${repoPath}:${branch}`
      const s = settled[i]
      const pr = s.status === 'fulfilled' ? s.value : null
      result[branch] = pr
      this.prCache.set(key, { data: pr, ts: now })
    }

    return { available: true, data: result }
  }

  private static async fetchGithubPrForBranch(repoPath: string, branch: string): Promise<PrInfo | null> {
    try {
      const { stdout } = await execFileAsync(
        'gh',
        [
          'pr', 'list',
          '--head', branch,
          '--state', 'open',
          '--limit', '1',
          '--json', 'number,state,title,url,statusCheckRollup,updatedAt',
        ],
        { cwd: repoPath, timeout: 10_000 }
      )

      let prs = JSON.parse(stdout)

      if (!prs || prs.length === 0) {
        const { stdout: allStdout } = await execFileAsync(
          'gh',
          [
            'pr', 'list',
            '--head', branch,
            '--state', 'all',
            '--limit', '5',
            '--json', 'number,state,title,url,statusCheckRollup,updatedAt',
          ],
          { cwd: repoPath, timeout: 10_000 }
        )
        prs = JSON.parse(allStdout)
        if (!prs || prs.length === 0) return null
        prs.sort((a: { updatedAt: string }, b: { updatedAt: string }) =>
          b.updatedAt.localeCompare(a.updatedAt)
        )
      }

      const pr = prs[0]
      return {
        number: pr.number,
        state: pr.state.toLowerCase() as PrState,
        title: pr.title,
        url: pr.url,
        checkStatus: this.rollupToStatus(pr.statusCheckRollup),
        updatedAt: pr.updatedAt,
      }
    } catch {
      return null
    }
  }

  private static async fetchGitlabMrForBranch(repoPath: string, branch: string): Promise<PrInfo | null> {
    try {
      const { stdout } = await execFileAsync(
        'glab',
        [
          'mr', 'list',
          '--head', branch,
          '--state', 'opened',
          '-F', 'json',
        ],
        { cwd: repoPath, timeout: 10_000 }
      )

      let mrs = JSON.parse(stdout)

      if (!mrs || mrs.length === 0) {
        const { stdout: allStdout } = await execFileAsync(
          'glab',
          [
            'mr', 'list',
            '--head', branch,
            '--state', 'all',
            '-F', 'json',
          ],
          { cwd: repoPath, timeout: 10_000 }
        )
        mrs = JSON.parse(allStdout)
        if (!mrs || mrs.length === 0) return null
        mrs.sort((a: { updated_at: string }, b: { updated_at: string }) =>
          b.updated_at.localeCompare(a.updated_at)
        )
      }

      const mr = mrs[0]
      const stateMap: Record<string, PrState> = { opened: 'open', merged: 'merged', closed: 'closed' }
      const pipelineStatus = mr.pipeline?.status
      let checkStatus: CheckStatus = 'none'
      if (pipelineStatus === 'success') checkStatus = 'passing'
      else if (pipelineStatus === 'failed' || pipelineStatus === 'canceled') checkStatus = 'failing'
      else if (pipelineStatus === 'running' || pipelineStatus === 'pending') checkStatus = 'pending'

      return {
        number: mr.iid,
        state: stateMap[mr.state] ?? 'open',
        title: mr.title,
        url: mr.web_url,
        checkStatus,
        updatedAt: mr.updated_at,
      }
    } catch {
      return null
    }
  }

  private static rollupToStatus(
    rollup: Array<{ status?: string; conclusion?: string; state?: string }> | undefined
  ): CheckStatus {
    if (!rollup || rollup.length === 0) return 'none'

    let hasFailure = false
    let hasPending = false

    for (const check of rollup) {
      const conclusion = check.conclusion?.toUpperCase()
      const state = check.state?.toUpperCase()
      const status = check.status?.toUpperCase()

      if (
        conclusion === 'FAILURE' || conclusion === 'TIMED_OUT' || conclusion === 'CANCELLED' ||
        state === 'FAILURE' || state === 'ERROR'
      ) {
        hasFailure = true
      } else if (
        status === 'IN_PROGRESS' || status === 'QUEUED' || status === 'PENDING' ||
        state === 'PENDING'
      ) {
        hasPending = true
      }
    }

    if (hasFailure) return 'failing'
    if (hasPending) return 'pending'
    return 'passing'
  }
}
