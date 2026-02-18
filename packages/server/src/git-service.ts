import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface FileStatus {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  staged: boolean
}

export interface FileDiff {
  path: string
  hunks: string
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  })
  return stdout.trimEnd()
}

export class GitService {
  static async isGitRepo(dirPath: string): Promise<boolean> {
    try {
      await git(['rev-parse', '--git-dir'], dirPath)
      return true
    } catch {
      return false
    }
  }

  static async getCurrentBranch(repoPath: string): Promise<string> {
    return git(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath)
  }

  static async getStatus(repoPath: string): Promise<FileStatus[]> {
    const output = await git(['status', '--porcelain=v1', '-uall'], repoPath)
    if (!output) return []

    const results: FileStatus[] = []
    for (const line of output.split('\n')) {
      const indexStatus = line[0]
      const workStatus = line[1]
      const path = line.slice(3)

      if (indexStatus === '?' && workStatus === '?') {
        results.push({ path, status: 'untracked', staged: false })
        continue
      }

      if (indexStatus !== ' ' && indexStatus !== '?') {
        const status: FileStatus['status'] =
          indexStatus === 'A' ? 'added' :
          indexStatus === 'D' ? 'deleted' :
          indexStatus === 'R' ? 'renamed' : 'modified'
        results.push({ path, status, staged: true })
      }

      if (workStatus !== ' ' && workStatus !== '?') {
        const status: FileStatus['status'] =
          workStatus === 'D' ? 'deleted' : 'modified'
        results.push({ path, status, staged: false })
      }
    }

    return results
  }

  static async getDiff(repoPath: string, staged: boolean): Promise<FileDiff[]> {
    const args = ['diff']
    if (staged) args.push('--staged')
    args.push('--unified=3')

    const output = await git(args, repoPath)
    if (!output) return []

    const files: FileDiff[] = []
    const parts = output.split(/^diff --git /m).filter(Boolean)
    for (const part of parts) {
      const firstLine = part.split('\n')[0]
      const match = firstLine.match(/b\/(.+)$/)
      if (match) {
        files.push({ path: match[1], hunks: 'diff --git ' + part })
      }
    }
    return files
  }

  static async getFileDiff(repoPath: string, filePath: string): Promise<string> {
    try {
      const unstaged = await git(['diff', '--', filePath], repoPath)
      if (unstaged) return unstaged
      return await git(['diff', '--staged', '--', filePath], repoPath)
    } catch {
      return ''
    }
  }

  static async getBranches(repoPath: string): Promise<string[]> {
    const [localOut, remoteOut] = await Promise.all([
      git(['branch', '--list', '--format=%(refname:short)'], repoPath),
      git(['branch', '-r', '--format=%(refname:short)'], repoPath).catch(() => ''),
    ])
    const seen = new Set<string>()
    const branches: string[] = []
    for (const name of localOut.split('\n').filter(Boolean)) {
      seen.add(name)
      branches.push(name)
    }
    for (const raw of remoteOut.split('\n').filter(Boolean)) {
      if (raw.endsWith('/HEAD')) continue
      const slash = raw.indexOf('/')
      const name = slash >= 0 ? raw.slice(slash + 1) : raw
      if (!seen.has(name)) {
        seen.add(name)
        branches.push(name)
      }
    }
    return branches
  }

  static async stage(repoPath: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return
    await git(['add', '--', ...paths], repoPath)
  }

  static async unstage(repoPath: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return
    await git(['reset', 'HEAD', '--', ...paths], repoPath)
  }

  static async discard(repoPath: string, paths: string[], untracked: string[]): Promise<void> {
    if (paths.length > 0) {
      await git(['checkout', '--', ...paths], repoPath)
    }
    if (untracked.length > 0) {
      await git(['clean', '-f', '--', ...untracked], repoPath)
    }
  }

  static async commit(repoPath: string, message: string): Promise<void> {
    await git(['commit', '-m', message], repoPath)
  }

  static async getParentBranch(repoPath: string, currentBranch: string): Promise<string> {
    try {
      const merge = await git(['config', `branch.${currentBranch}.merge`], repoPath)
      if (merge) return merge.replace('refs/heads/', '')
    } catch {}

    try {
      const ref = await git(['symbolic-ref', 'refs/remotes/origin/HEAD'], repoPath)
      if (ref) return ref.replace('refs/remotes/origin/', '')
    } catch {}

    return 'main'
  }

  static async cloneBare(url: string, targetDir: string): Promise<string> {
    await execFileAsync('git', ['clone', '--bare', url, targetDir], { maxBuffer: 10 * 1024 * 1024 })
    return targetDir
  }

  static async cloneLocal(source: string, target: string): Promise<string> {
    await execFileAsync('git', ['clone', '--local', source, target], { maxBuffer: 10 * 1024 * 1024 })
    return target
  }

  static async setRemoteUrl(repoPath: string, remote: string, url: string): Promise<void> {
    await git(['remote', 'set-url', remote, url], repoPath)
  }

  static async getRemoteUrl(repoPath: string, remote = 'origin'): Promise<string | null> {
    try {
      return await git(['remote', 'get-url', remote], repoPath)
    } catch {
      return null
    }
  }

  static async fetchAll(bareDir: string): Promise<void> {
    await git(['fetch', '--all', '--prune'], bareDir)
  }

  static async checkout(repoPath: string, branch: string): Promise<void> {
    await git(['checkout', branch], repoPath)
  }

  static async checkoutNewBranch(repoPath: string, branch: string, base?: string): Promise<void> {
    const args = ['checkout', '-b', branch]
    if (base) args.push(base)
    await git(args, repoPath)
  }
}
