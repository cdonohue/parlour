# Phase D: Web/Cloud

Status: **Planned** (depends on Phase C or can be done in parallel)

Hosted service running PTY processes in containers. Same API contract as desktop, accessed over HTTP/WebSocket instead of IPC.

## Prerequisites

- `@parlour/app` fully extracted behind `PlatformAdapter` (Phase B, done)
- SSE event stream endpoint (Phase B, done)
- PTY WebSocket streaming (Phase B, done)
- `parlour` CLI with `PARLOUR_API_URL` transport resolution (Phase A, done)

## D1. Cloud Backend

Hosted service running PTY processes in containers. Same operations as desktop main process but exposed over HTTP/WebSocket.

Runtime options:
- **Cloudflare Workers + Containers** — Workers for API, Containers for PTY processes
- **AWS ECS/Fargate** — container per user session
- **Fly.io** — closest to metal, persistent VMs

Each user session gets a container with:
- PTY processes (one per chat)
- Filesystem (`~/.parlour/chats/`)
- API server (same routes as desktop)
- `parlour` CLI (already works via `PARLOUR_API_URL`)

## D2. Authentication

```
PARLOUR_API_URL=https://parlour.example.com/api
PARLOUR_API_TOKEN=<jwt>
```

API server validates JWT on every request. WebSocket connections authenticated on upgrade.

`parlour` CLI reads `PARLOUR_API_TOKEN` from env — already supported in transport resolution.

## D3. Web PlatformAdapter

```typescript
function createWebAdapter(apiUrl: string, token: string): PlatformAdapter {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const wsUrl = apiUrl.replace(/^http/, 'ws')

  return {
    pty: {
      create: async (dir, shell, env, cmd) => {
        const res = await fetch(`${apiUrl}/pty/create`, { method: 'POST', headers, body: JSON.stringify({ dir, shell, env, cmd }) })
        return (await res.json()).ptyId
      },
      write: (id, data) => { wsSockets.get(id)?.send(data) },
      onData: (id, cb) => {
        const ws = new WebSocket(`${wsUrl}/pty/${id}/stream?token=${token}`)
        ws.onmessage = (e) => cb(e.data)
        wsSockets.set(id, ws)
        return () => { ws.close(); wsSockets.delete(id) }
      },
      // ...
    },
    chatRegistry: {
      getState: async () => (await fetch(`${apiUrl}/registry/state`, { headers })).json(),
      onStateChanged: (cb) => {
        const es = new EventSource(`${apiUrl}/events?types=chat:*`)
        es.onmessage = (e) => cb(JSON.parse(e.data))
        return () => es.close()
      },
      // ...
    },
    // ...
  }
}
```

## D4. Desktop → Cloud Operation Mapping

Desktop-only operations become no-ops or get cloud equivalents:

| Desktop | Cloud |
|---------|-------|
| `app.selectDirectory` | File upload widget |
| `theme.setMode` | CSS variable toggle (client-side) |
| `theme.onResolvedChanged` | `matchMedia` listener (client-side) |
| `fs.readFile/writeFile` | `GET/PUT /api/files/{path}` |
| `shell.runCommand` | `POST /api/shell/exec` (sandboxed) |
| `shell.openExternal` | `window.open()` |

## D5. Static Frontend

React bundle served from CDN. Entry point:

```tsx
const token = await authenticate()
const adapter = createWebAdapter(import.meta.env.VITE_API_URL, token)
initApp(adapter)
root.render(<PlatformProvider adapter={adapter}><App /></PlatformProvider>)
```

## D6. Session Management

- Container spun up on login, kept warm for session duration
- Idle timeout (30 min) → container hibernated, PTYs saved to disk
- Resume → container restarted, PTYs re-spawned with `--continue`
- Persistent storage: S3/R2 for `~/.parlour/chats/`

## D7. File Structure

```
web/
  src/
    adapter.ts           # createWebAdapter()
    auth.ts              # JWT authentication flow
    main.tsx             # Entry point (~40 lines)
  vite.config.ts
cloud/
  src/
    server.ts            # API server (extends ParlourService)
    pty-cloud.ts         # Container PTY management
    auth.ts              # JWT validation middleware
    storage.ts           # S3/R2 persistence layer
  Dockerfile
  wrangler.toml          # (if Cloudflare)
```

## Open Questions

- Runtime choice: Cloudflare vs Fly.io vs ECS — depends on latency requirements and cost model
- Auth provider: self-hosted JWT vs OAuth (GitHub, Google)
- Container isolation model: per-user vs per-chat
- Persistent storage: S3/R2 vs volume mounts
- WebSocket scaling: sticky sessions vs pub/sub for multi-instance
