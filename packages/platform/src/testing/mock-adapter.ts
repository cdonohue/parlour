import type { PlatformAdapter } from '../adapter'

type Unsubscribe = () => void
const noop = () => {}
const noopUnsub = (): Unsubscribe => noop
const resolved = <T>(val: T) => Promise.resolve(val)

export function createMockAdapter(overrides: Partial<PlatformAdapter> = {}): PlatformAdapter {
  return {
    git: {
      getStatus: () => resolved({}),
      getDiff: () => resolved({}),
      getFileDiff: () => resolved({}),
      getBranches: () => resolved({}),
      stage: () => resolved(undefined),
      unstage: () => resolved(undefined),
      discard: () => resolved(undefined),
      commit: () => resolved({}),
      getCurrentBranch: () => resolved('main'),
      isGitRepo: () => resolved(false),
      cloneBare: () => resolved(''),
      getParentBranch: () => resolved('main'),
    },
    pty: {
      create: () => resolved('pty-1'),
      write: noop,
      resize: noop,
      destroy: noop,
      list: () => resolved([]),
      getBuffer: () => resolved(''),
      onData: () => noopUnsub(),
      onTitle: () => noopUnsub(),
      onFirstInput: () => noopUnsub(),
      onExit: () => noopUnsub(),
    },
    fs: {
      readFile: () => resolved(''),
      writeFile: () => resolved(undefined),
    },
    app: {
      selectDirectory: () => resolved(null),
      addProjectPath: () => resolved(undefined),
      getDataPath: () => resolved('/tmp/chorale'),
      getChoralePath: () => resolved('/tmp/chorale'),
      discoverOpeners: () => resolved([]),
      openIn: () => resolved(undefined),
    },
    chat: {
      createDir: () => resolved('/tmp/chat'),
      removeDir: () => resolved(undefined),
      writeAgentsMd: () => resolved(undefined),
      generateTitle: () => resolved(null),
      summarizeContext: () => resolved(null),
      notifyParent: () => resolved(undefined),
      getSessionId: () => resolved(null),
    },
    schedules: {
      list: () => resolved([]),
      create: () => resolved({}),
      delete: () => resolved(undefined),
      toggle: () => resolved(undefined),
      update: () => resolved(undefined),
      runNow: () => resolved(undefined),
      onChanged: () => noopUnsub(),
    },
    github: {
      getPrStatuses: () => resolved({}),
    },
    shell: {
      runCommand: () => resolved({ success: true, output: '' }),
      openExternal: () => resolved(undefined),
    },
    api: {
      getPort: () => resolved(0),
    },
    chatRegistry: {
      getState: () => resolved({ chats: [] }),
      onStateChanged: () => noopUnsub(),
      update: () => resolved(undefined),
      create: () => resolved({ chat: { id: 'new', name: 'New Chat' } }),
      createChild: () => resolved({ chat: { id: 'child', name: 'New Chat' } }),
      resume: () => resolved({}),
      delete: () => resolved(undefined),
      retitle: () => resolved(undefined),
    },
    cli: {
      detect: () => resolved([]),
      baseDefaults: () => resolved({}),
    },
    theme: {
      setMode: () => resolved(undefined),
      setResolved: () => {},
      onResolvedChanged: () => noopUnsub(),
    },
    state: {
      save: () => resolved(undefined),
      load: () => resolved(null),
    },
    notifications: {
      onNotification: () => noopUnsub(),
    },
    ...overrides,
  }
}
