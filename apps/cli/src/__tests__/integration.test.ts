import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFile } from 'node:child_process'
import { createTestServer, type TestServer } from '../../../../packages/server/src/__tests__/test-server'

const CLI_PATH = new URL('../index.ts', import.meta.url).pathname

function runCli(args: string[], env: Record<string, string> = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile('bun', ['run', CLI_PATH, ...args], {
      env: { ...process.env, ...env },
      timeout: 10_000,
    }, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve({ stdout, stderr })
    })
    child.stdin?.end()
  })
}

describe('CLI Integration', () => {
  let server: TestServer
  let chatId: string

  beforeAll(async () => {
    server = await createTestServer()

    const res = await server.fetch('/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CLI Test Chat', llmCommand: 'echo hello' }),
    })
    const { chat } = await res.json()
    chatId = chat.id
  }, 30_000)

  afterAll(async () => {
    await server?.cleanup()
  }, 10_000)

  const env = () => ({
    CHORALE_API_URL: server.baseUrl,
    CHORALE_CHAT_ID: chatId,
  })

  it('status <chatId> returns JSON with status', async () => {
    const { stdout } = await runCli(['status', chatId], env())
    const result = JSON.parse(stdout)
    expect(result).toHaveProperty('status')
    expect(result).toHaveProperty('name')
  })

  it('list-children returns array', async () => {
    const { stdout } = await runCli(['list-children'], env())
    const result = JSON.parse(stdout)
    expect(Array.isArray(result)).toBe(true)
  })

  it('schedule list returns array', async () => {
    const { stdout } = await runCli(['schedule', 'list'], env())
    const result = JSON.parse(stdout)
    expect(Array.isArray(result)).toBe(true)
  })

  it('hook harness:thinking succeeds', async () => {
    await expect(
      runCli(['hook', 'harness:thinking'], env()),
    ).resolves.toBeDefined()
  })
})
