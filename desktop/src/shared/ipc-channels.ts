// IPC channel constants shared between main and renderer

export const IPC = {
  // Git operations
  GIT_GET_STATUS: 'git:get-status',
  GIT_GET_DIFF: 'git:get-diff',
  GIT_GET_FILE_DIFF: 'git:get-file-diff',
  GIT_GET_BRANCHES: 'git:get-branches',
  GIT_STAGE: 'git:stage',
  GIT_UNSTAGE: 'git:unstage',
  GIT_DISCARD: 'git:discard',
  GIT_COMMIT: 'git:commit',
  GIT_GET_CURRENT_BRANCH: 'git:get-current-branch',
  GIT_IS_REPO: 'git:is-repo',
  GIT_GET_PARENT_BRANCH: 'git:get-parent-branch',

  // PTY operations
  PTY_CREATE: 'pty:create',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_DESTROY: 'pty:destroy',
  PTY_LIST: 'pty:list',
  PTY_DATA: 'pty:data', // prefix for events: `pty:data:{id}`
  PTY_TITLE: 'pty:title', // prefix for events: `pty:title:{id}`
  PTY_GET_BUFFER: 'pty:get-buffer',
  PTY_FIRST_INPUT: 'pty:first-input', // prefix: `pty:first-input:{id}`
  PTY_EXIT: 'pty:exit', // prefix: `pty:exit:{id}`

  // File operations
  FS_READ_FILE: 'fs:read-file',
  FS_WRITE_FILE: 'fs:write-file',

  // App operations
  APP_SELECT_DIRECTORY: 'app:select-directory',
  APP_ADD_PROJECT_PATH: 'app:add-project-path',
  APP_GET_DATA_PATH: 'app:get-data-path',
  APP_GET_PARLOUR_PATH: 'app:get-parlour-path',

  // Schedule operations
  SCHEDULE_LIST: 'schedule:list',
  SCHEDULE_CREATE: 'schedule:create',
  SCHEDULE_DELETE: 'schedule:delete',
  SCHEDULE_TOGGLE: 'schedule:toggle',
  SCHEDULE_UPDATE: 'schedule:update',

  SCHEDULE_RUN_NOW: 'schedule:run-now',
  SCHEDULE_CHANGED: 'schedule:changed',

  // GitHub operations
  GITHUB_GET_PR_STATUSES: 'github:get-pr-statuses',

  // Shell operations
  SHELL_RUN_COMMAND: 'shell:run-command',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',

  // API server
  API_GET_PORT: 'api:get-port',

  // Git clone
  GIT_CLONE_BARE: 'git:clone-bare',

  // Chat workspace operations
  CHAT_CREATE_DIR: 'chat:create-dir',
  CHAT_REMOVE_DIR: 'chat:remove-dir',
  CHAT_WRITE_AGENTS_MD: 'chat:write-agents-md',
  CHAT_GENERATE_TITLE: 'chat:generate-title',
  CHAT_SUMMARIZE_CONTEXT: 'chat:summarize-context',
  CHAT_NOTIFY_PARENT: 'chat:notify-parent',
  CHAT_GET_SESSION_ID: 'chat:get-session-id',

  // Opener discovery
  APP_DISCOVER_OPENERS: 'app:discover-openers',
  APP_OPEN_IN: 'app:open-in',

  // Chat registry
  CHAT_REGISTRY_GET_STATE: 'chat-registry:get-state',
  CHAT_REGISTRY_STATE_CHANGED: 'chat-registry:state-changed',
  CHAT_REGISTRY_UPDATE: 'chat-registry:update',
  CHAT_REGISTRY_CREATE: 'chat-registry:create',
  CHAT_REGISTRY_CREATE_CHILD: 'chat-registry:create-child',
  CHAT_REGISTRY_RESUME: 'chat-registry:resume',
  CHAT_REGISTRY_DELETE: 'chat-registry:delete',

  CHAT_REGISTRY_RETITLE: 'chat-registry:retitle',

  // CLI detection
  CLI_DETECT: 'cli:detect',
  CLI_BASE_DEFAULTS: 'cli:base-defaults',

  // Theme
  THEME_SET_MODE: 'theme:set-mode',
  THEME_RESOLVED_CHANGED: 'theme:resolved-changed',

  // State persistence
  STATE_SAVE: 'state:save',
  STATE_LOAD: 'state:load',
} as const
