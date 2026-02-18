type Unsubscribe = () => void

export interface GitAdapter {
  getStatus(repoPath: string): Promise<unknown>
  getDiff(repoPath: string, staged: boolean): Promise<unknown>
  getFileDiff(repoPath: string, filePath: string): Promise<unknown>
  getBranches(repoPath: string): Promise<unknown>
  stage(repoPath: string, paths: string[]): Promise<void>
  unstage(repoPath: string, paths: string[]): Promise<void>
  discard(repoPath: string, paths: string[], untracked: string[]): Promise<void>
  commit(repoPath: string, message: string): Promise<unknown>
  getCurrentBranch(repoPath: string): Promise<string>
  isGitRepo(dirPath: string): Promise<boolean>
  cloneBare(url: string, targetDir: string): Promise<string>
  getParentBranch(repoPath: string, branch: string): Promise<string>
}

export interface PtyAdapter {
  create(workingDir: string, shell?: string, extraEnv?: Record<string, string>, command?: string[]): Promise<string>
  write(ptyId: string, data: string): void
  resize(ptyId: string, cols: number, rows: number): void
  destroy(ptyId: string): void
  list(): Promise<string[]>
  getBuffer(ptyId: string): Promise<string>
  onData(ptyId: string, callback: (data: string) => void): Unsubscribe
  onTitle(ptyId: string, callback: (title: string) => void): Unsubscribe
  onFirstInput(ptyId: string, callback: (input: string) => void): Unsubscribe
  onExit(ptyId: string, callback: (exitCode: number) => void): Unsubscribe
}

export interface FsAdapter {
  readFile(filePath: string): Promise<unknown>
  writeFile(filePath: string, content: string): Promise<void>
}

export interface AppAdapter {
  selectDirectory(): Promise<string | null>
  addProjectPath(dirPath: string): Promise<void>
  getDataPath(): Promise<string>
  getParlourPath(): Promise<string>
  discoverOpeners(): Promise<Array<{ id: string; name: string }>>
  openIn(openerId: string, dirPath: string): Promise<void>
}

export interface ChatAdapter {
  createDir(chatId: string, parentDirPath?: string): Promise<string>
  removeDir(chatId: string): Promise<void>
  writeAgentsMd(chatDir: string): Promise<void>
  generateTitle(prompt: string, llmCommand?: string): Promise<string | null>
  summarizeContext(ptyId: string): Promise<string | null>
  notifyParent(parentPtyId: string, message: string): Promise<void>
  getSessionId(chatDir: string): Promise<string | null>
}

export interface SchedulesAdapter {
  list(): Promise<unknown>
  create(opts: unknown): Promise<unknown>
  delete(id: string): Promise<void>
  toggle(id: string): Promise<void>
  update(id: string, partial: {
    name?: string; prompt?: string; project?: string
    trigger?: { type: 'cron'; cron: string } | { type: 'once'; at: string }
  }): Promise<void>
  runNow(id: string): Promise<void>
  onChanged(callback: (schedules: unknown[]) => void): Unsubscribe
}

export interface GithubAdapter {
  getPrStatuses(repoPath: string, branches: string[]): Promise<unknown>
}

export interface ShellAdapter {
  runCommand(command: string, cwd: string): Promise<{ success: boolean; output: string }>
  openExternal(url: string): Promise<void>
}

export interface ApiAdapter {
  getPort(): Promise<number>
}

export interface ChatRegistryAdapter {
  getState(): Promise<unknown>
  onStateChanged(callback: (state: { chats: unknown[] }) => void): Unsubscribe
  update(id: string, partial: Record<string, unknown>): Promise<void>
  create(opts: unknown): Promise<unknown>
  createChild(parentId: string, opts: unknown): Promise<unknown>
  resume(chatId: string): Promise<unknown>
  delete(chatId: string): Promise<void>
  retitle(chatId: string): Promise<void>
}

export interface CliAdapter {
  detect(): Promise<string[]>
  baseDefaults(): Promise<Record<string, string>>
}

export interface ThemeAdapter {
  setMode(mode: string): Promise<void>
  onResolvedChanged(callback: (resolved: 'dark' | 'light') => void): Unsubscribe
}

export interface StateAdapter {
  save(data: unknown): Promise<void>
  load(): Promise<unknown>
}

export interface PlatformAdapter {
  git: GitAdapter
  pty: PtyAdapter
  fs: FsAdapter
  app: AppAdapter
  chat: ChatAdapter
  schedules: SchedulesAdapter
  github: GithubAdapter
  shell: ShellAdapter
  api: ApiAdapter
  chatRegistry: ChatRegistryAdapter
  cli: CliAdapter
  theme: ThemeAdapter
  state: StateAdapter
}
