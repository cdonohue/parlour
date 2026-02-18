import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { useTestServer } from './test-server'

const execAsync = promisify(execFile)

describe('API Server Integration', () => {
  const { server } = useTestServer()
  const api = (path: string, opts?: RequestInit) => server().fetch(path, opts)
  const json = (path: string, opts?: RequestInit) => api(path, opts).then((r) => r.json())
  const post = (path: string, body: unknown) =>
    api(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  describe('Health', () => {
    it('GET /health returns 200', async () => {
      const res = await fetch(`${server().baseUrl}/health`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: 'ok' })
    })
  })

  describe('State', () => {
    it('save → load round-trip', async () => {
      const data = { settings: { llmCommand: 'test-llm' } }
      await post('/state/save', { data })
      const loaded = await json('/state/load')
      expect(loaded).toEqual(data)
    })
  })

  describe('Theme', () => {
    it('POST /theme/mode accepts mode', async () => {
      const res = await post('/theme/mode', { mode: 'light' })
      expect(res.status).toBe(200)
    })

    it('GET /theme/resolved returns dark or light', async () => {
      const res = await json('/theme/resolved')
      expect(['dark', 'light']).toContain(res.resolved)
    })
  })

  describe('CLI', () => {
    it('GET /cli/detect returns array', async () => {
      const res = await json('/cli/detect')
      expect(Array.isArray(res)).toBe(true)
    })

    it('GET /cli/defaults returns object', async () => {
      const res = await json('/cli/defaults')
      expect(typeof res).toBe('object')
    })
  })

  describe('App', () => {
    it('GET /app/parlour-path returns temp dir', async () => {
      const res = await json('/app/parlour-path')
      expect(res.path).toBe(server().dataDir)
    })

    it('GET /app/openers returns array', async () => {
      const res = await json('/app/openers')
      expect(Array.isArray(res)).toBe(true)
    })
  })

  describe('Chats', () => {
    it('GET /chats returns initial state', async () => {
      const res = await json('/chats')
      expect(res).toHaveProperty('chats')
      expect(Array.isArray(res.chats)).toBe(true)
    })

    it('create → get state → patch name → delete', async () => {
      const createRes = await post('/chats', { name: 'Test Chat', llmCommand: 'echo hello' })
      const { chat } = await createRes.json()
      expect(chat.id).toBeDefined()
      expect(chat.name).toBe('Test Chat')

      const state = await json('/chats')
      expect(state.chats.some((c: { id: string }) => c.id === chat.id)).toBe(true)

      await api(`/chats/${chat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Renamed' }),
      })
      const after = await json('/chats')
      const patched = after.chats.find((c: { id: string }) => c.id === chat.id)
      expect(patched.name).toBe('Renamed')

      await api(`/chats/${chat.id}`, { method: 'DELETE' })
      const final = await json('/chats')
      expect(final.chats.some((c: { id: string }) => c.id === chat.id)).toBe(false)
    })
  })

  describe('PTY', () => {
    it('create → list → get buffer → destroy → verify gone', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'pty-test-'))
      const createRes = await post('/pty', { workingDir: dir, command: ['echo', 'hi'] })
      const { ptyId } = await createRes.json()
      expect(ptyId).toBeDefined()

      const list = await json('/pty')
      expect(list).toContain(ptyId)

      await new Promise((r) => setTimeout(r, 500))

      const buf = await json(`/pty/${ptyId}/buffer`)
      expect(buf).toHaveProperty('buffer')
      expect(typeof buf.buffer).toBe('string')

      await api(`/pty/${ptyId}`, { method: 'DELETE' })
      const after = await json('/pty')
      expect(after).not.toContain(ptyId)
    })
  })

  describe('Git', () => {
    let repoDir: string

    it('init repo and test git routes', async () => {
      repoDir = await mkdtemp(join(tmpdir(), 'git-test-'))
      await execAsync('git', ['init', repoDir])
      await execAsync('git', ['-C', repoDir, 'config', 'user.email', 'test@test.com'])
      await execAsync('git', ['-C', repoDir, 'config', 'user.name', 'Test'])
      await writeFile(join(repoDir, 'README.md'), '# Test\n')
      await execAsync('git', ['-C', repoDir, 'add', '.'])
      await execAsync('git', ['-C', repoDir, 'commit', '-m', 'init'])

      const isRepo = await post('/git/is-repo', { dirPath: repoDir }).then((r) => r.json())
      expect(isRepo).toBe(true)

      const branch = await post('/git/current-branch', { repoPath: repoDir }).then((r) => r.json())
      expect(typeof branch).toBe('string')

      const status = await post('/git/status', { repoPath: repoDir }).then((r) => r.json())
      expect(Array.isArray(status)).toBe(true)

      const branches = await post('/git/branches', { repoPath: repoDir }).then((r) => r.json())
      expect(Array.isArray(branches)).toBe(true)
      expect(branches.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('FS', () => {
    it('write → read round-trip', async () => {
      const filePath = join(server().dataDir, 'test-file.txt')
      const content = 'hello from integration test'
      await post('/fs/write', { filePath, content })
      const read = await post('/fs/read', { filePath }).then((r) => r.json())
      expect(read).toBe(content)
    })
  })

  describe('Schedules', () => {
    it('create → list → toggle', async () => {
      const createRes = await post('/schedules', {
        prompt: 'Test schedule',
        cron: '0 * * * *',
      })
      const schedule = await createRes.json()
      expect(schedule.id).toBeDefined()

      const list = await json('/schedules')
      expect(list.some((s: { id: string }) => s.id === schedule.id)).toBe(true)

      const toggleRes = await post(`/schedules/${schedule.id}/toggle`, {})
      const toggled = await toggleRes.json()
      expect(toggled.ok).toBe(true)
    })
  })
})
