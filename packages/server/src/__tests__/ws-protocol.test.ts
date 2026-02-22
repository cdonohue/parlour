import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { WebSocket } from 'ws'
import type { ClientMessage, ServerMessage } from '@chorale/api-types'
import { useTestServer } from './test-server'

class WsClient {
  ws: WebSocket
  private messages: ServerMessage[] = []
  private waiters: Array<{ predicate: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }> = []

  constructor(baseUrl: string) {
    const wsUrl = baseUrl.replace('http', 'ws') + '/ws'
    this.ws = new WebSocket(wsUrl)
    this.ws.on('message', (raw) => {
      const msg: ServerMessage = JSON.parse(raw.toString())
      this.messages.push(msg)
      for (let i = this.waiters.length - 1; i >= 0; i--) {
        if (this.waiters[i].predicate(msg)) {
          const w = this.waiters.splice(i, 1)[0]
          w.resolve(msg)
        }
      }
    })
  }

  ready(timeout = 5000): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WS open timeout')), timeout)
      this.ws.on('open', () => { clearTimeout(timer); resolve() })
      this.ws.on('error', (err) => { clearTimeout(timer); reject(err) })
    })
  }

  waitFor(predicate: (m: ServerMessage) => boolean, timeout = 5000): Promise<ServerMessage> {
    const existing = this.messages.find(predicate)
    if (existing) return Promise.resolve(existing)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WS message timeout')), timeout)
      this.waiters.push({
        predicate,
        resolve: (msg) => { clearTimeout(timer); resolve(msg) },
      })
    })
  }

  clearMessages(): void {
    this.messages.length = 0
  }

  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg))
  }

  close(): void {
    this.ws.close()
  }
}

describe('WebSocket Protocol', () => {
  const { server } = useTestServer()

  function createClient(): WsClient {
    return new WsClient(server().baseUrl)
  }

  it('receives hello on connect', async () => {
    const client = createClient()
    try {
      await client.ready()
      const msg = await client.waitFor((m) => m.type === 'hello')
      expect(msg.type).toBe('hello')
      if (msg.type === 'hello') expect(msg.version).toBe('1')
    } finally {
      client.close()
    }
  })

  it('state:subscribe → receives state:chats + state:schedules', async () => {
    const client = createClient()
    try {
      await client.ready()
      await client.waitFor((m) => m.type === 'hello')

      client.send({ type: 'state:subscribe' })

      const chats = await client.waitFor((m) => m.type === 'state:chats')
      expect(chats.type).toBe('state:chats')
      if (chats.type === 'state:chats') expect(Array.isArray(chats.chats)).toBe(true)

      const schedules = await client.waitFor((m) => m.type === 'state:schedules')
      expect(schedules.type).toBe('state:schedules')
      if (schedules.type === 'state:schedules') expect(Array.isArray(schedules.schedules)).toBe(true)
    } finally {
      client.close()
    }
  })

  it('PTY subscribe → receives data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ws-pty-'))
    const client = createClient()
    try {
      await client.ready()
      await client.waitFor((m) => m.type === 'hello')

      const res = await server().fetch('/pty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workingDir: dir }),
      })
      const { ptyId } = await res.json()

      client.send({ type: 'pty:subscribe', ptyId })

      const msg = await client.waitFor(
        (m) => (m.type === 'pty:buffer' || m.type === 'pty:data') && m.ptyId === ptyId,
      )
      expect(['pty:buffer', 'pty:data']).toContain(msg.type)

      server().fetch(`/pty/${ptyId}`, { method: 'DELETE' })
    } finally {
      client.close()
    }
  })

  it('pty:write sends data to PTY', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ws-write-'))
    const client = createClient()
    try {
      await client.ready()
      await client.waitFor((m) => m.type === 'hello')

      const res = await server().fetch('/pty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workingDir: dir }),
      })
      const { ptyId } = await res.json()

      client.send({ type: 'pty:subscribe', ptyId })
      await client.waitFor(
        (m) => (m.type === 'pty:buffer' || m.type === 'pty:data') && m.ptyId === ptyId,
      )

      client.send({ type: 'pty:write', ptyId, data: 'echo ws-write-test\r' })

      const data = await client.waitFor(
        (m) => m.type === 'pty:data' && m.ptyId === ptyId && 'data' in m && m.data.includes('ws-write-test'),
      )
      expect(data.type).toBe('pty:data')

      server().fetch(`/pty/${ptyId}`, { method: 'DELETE' })
    } finally {
      client.close()
    }
  })

  it('pty:resize does not error', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ws-resize-'))
    const res = await server().fetch('/pty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDir: dir }),
    })
    const { ptyId } = await res.json()

    const client = createClient()
    try {
      await client.ready()

      client.send({ type: 'pty:resize', ptyId, cols: 120, rows: 40 })
      await new Promise((r) => setTimeout(r, 200))

      expect(client.ws.readyState).toBe(WebSocket.OPEN)
    } finally {
      client.close()
      server().fetch(`/pty/${ptyId}`, { method: 'DELETE' })
    }
  })

  it('pty:unsubscribe stops data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ws-unsub-'))
    const res = await server().fetch('/pty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDir: dir }),
    })
    const { ptyId } = await res.json()

    const client = createClient()
    try {
      await client.ready()
      await client.waitFor((m) => m.type === 'hello')
      client.send({ type: 'pty:subscribe', ptyId })
      await new Promise((r) => setTimeout(r, 500))

      client.send({ type: 'pty:unsubscribe', ptyId })
      await new Promise((r) => setTimeout(r, 200))
      client.clearMessages()

      client.send({ type: 'pty:write', ptyId, data: 'echo after-unsub\r' })

      const gotData = await client.waitFor(
        (m) => m.type === 'pty:data' && m.ptyId === ptyId,
        1000,
      ).then(() => true).catch(() => false)

      expect(gotData).toBe(false)
    } finally {
      client.close()
      server().fetch(`/pty/${ptyId}`, { method: 'DELETE' })
    }
  })

  it('theme:resolved message is accepted by server', async () => {
    const client = createClient()
    try {
      await client.ready()
      await client.waitFor((m) => m.type === 'hello')

      client.send({ type: 'theme:resolved', resolved: 'light' })
      await new Promise((r) => setTimeout(r, 200))

      expect(client.ws.readyState).toBe(WebSocket.OPEN)

      const res = await server().fetch('/theme/resolved')
      const data = await res.json()
      expect(['dark', 'light']).toContain(data.resolved)
    } finally {
      client.close()
    }
  })

  it('client disconnect does not crash server', async () => {
    const client = createClient()
    await client.ready()
    await client.waitFor((m) => m.type === 'hello')

    client.ws.terminate()
    await new Promise((r) => setTimeout(r, 200))

    const health = await fetch(`${server().baseUrl}/health`)
    expect(health.status).toBe(200)
  })
})
