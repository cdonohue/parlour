# Plan: Bring Your Own Cloud

## Overview

Add a self-deployable cloud package so users can run Parlour on their own Cloudflare account. The app works locally by default — cloud is opt-in configuration. Zero changes to `@parlour/server` or the UI. The existing architecture already supports this: `createWebSocketAdapter(serverUrl)` works with any URL.

## Model

```
Local (default):
  Tauri/Browser → WS → localhost:PORT → @parlour/server (local node-pty)

Cloud (bring your own):
  Browser → WS → https://parlour.user.workers.dev → CF Worker → CF Container → @parlour/server (container node-pty)
```

The user deploys a Cloudflare Worker + Container to their own account. The Container runs the exact same `@parlour/server` code. The Worker proxies HTTP/WS to it and serves the static frontend.

## Changes

### 1. Static file serving in ApiServer

**File**: `packages/server/src/api-server.ts`

Add optional static file serving so the server can serve the built frontend when running in a container. Enabled via `--static-dir` CLI flag.

```
// In handleRequest, before API routing:
if (staticDir && !url.pathname.startsWith('/api') && !url.pathname.startsWith('/ws')) {
  return serveStaticFile(staticDir, url.pathname, res)
}
```

This lets the container be fully self-contained — no separate static hosting needed.

### 2. Browser entry point: auto-detect server URL

**File**: `packages/app/dev/main.tsx`

One-line change — if no `port` URL param, use current origin:

```typescript
// Before:
const port = params.get('port') ?? '3000'
const serverUrl = `http://localhost:${port}`

// After:
const port = params.get('port')
const serverUrl = port ? `http://localhost:${port}` : window.location.origin
```

This makes the same build work for both local dev (`?port=3000`) and cloud (no param → same origin).

### 3. Cloud deployment package

**New directory**: `cloud/`

```
cloud/
  Dockerfile            # Builds @parlour/server + static frontend
  wrangler.jsonc        # Cloudflare Container config
  src/
    index.ts            # Worker: proxies HTTP/WS to container
  README.md             # Deploy instructions
```

#### Dockerfile

```dockerfile
FROM node:22-slim

# Install build tools for node-pty
RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy repo and install
COPY . .
RUN npm install -g bun && bun install

# Build the static frontend
RUN bun run build:dev --outDir /app/dist

# Expose the server port
EXPOSE 3000

# Run the server with static file serving
CMD ["bun", "run", "packages/server/src/main.ts", "--port", "3000", "--static-dir", "/app/dist"]
```

#### wrangler.jsonc

```jsonc
{
  "name": "parlour-cloud",
  "main": "src/index.ts",
  "compatibility_date": "2025-12-01",
  "compatibility_flags": ["nodejs_compat"],
  "containers": [
    {
      "class_name": "ParlourContainer",
      "image": "./Dockerfile",
      "instance_type": "standard-2",
      "max_instances": 1
    }
  ],
  "durable_objects": {
    "bindings": [
      { "name": "PARLOUR_CONTAINER", "class_name": "ParlourContainer" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["ParlourContainer"] }
  ]
}
```

#### Worker (`src/index.ts`)

```typescript
import { Container } from '@cloudflare/containers'

export class ParlourContainer extends Container {
  override sleepAfter = 1800_000 // 30 min idle → sleep

  defaultPort = 3000

  override async onStart(): Promise<void> {
    // Container starts @parlour/server via Dockerfile CMD
  }
}

interface Env {
  PARLOUR_CONTAINER: DurableObjectNamespace<ParlourContainer>
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Single-user: always use the same container instance
    const id = env.PARLOUR_CONTAINER.idFromName('default')
    const stub = env.PARLOUR_CONTAINER.get(id)

    // Proxy everything (HTTP + WebSocket upgrade) to the container
    return stub.fetch(request)
  },
}
```

### 4. Build script for cloud

**File**: `package.json` (root)

Add a `build:cloud` script:

```json
"build:cloud": "bun run build && cp -r packages/app/dev/dist cloud/static"
```

### 5. Mobile support (viewing + interaction)

Make the cloud UI usable on phones — both watching agent output and typing into sessions. xterm.js already supports mobile virtual keyboards (tap terminal → soft keyboard → type → `onData` fires → `pty:write`). The input data path needs zero changes. We just need the UI to render correctly on small screens.

#### 5a. Viewport meta tag

**Files**: `packages/app/dev/index.html`, `tauri/index.html`

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

Without this, phones assume 980px width and zoom out — text is illegible.

#### 5b. `useIsMobile` hook

**New file**: `packages/app/src/hooks/useIsMobile.ts`

```typescript
const MOBILE_BREAKPOINT = 600
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return mobile
}
```

#### 5c. Single-column layout on mobile

**File**: `packages/app/src/App.tsx`

On narrow screens, skip Allotment entirely. Sidebar becomes a slide-over drawer (toggle button in top-left). Terminal takes full viewport width and height.

```tsx
if (isMobile) {
  return (
    <div className={styles.mobileRoot}>
      {sidebarOpen && <Sidebar onClose={closeSidebar} />}
      <ContentArea />
    </div>
  )
}
// else: existing Allotment layout
```

#### 5d. Mobile CSS overrides

**File**: `packages/ui/src/styles/design-tokens.css` (or new mobile override)

```css
@media (max-width: 600px) {
  :root {
    --text-base: 16px;      /* prevent iOS auto-zoom, improve readability */
    --text-sm: 14px;
  }
}
```

Touch targets: buttons get `min-height: 44px` on mobile.

#### 5e. Connection status indicator

**File**: `packages/ui/src/components/ConnectionStatus/ConnectionStatus.tsx` (new)

On mobile networks, WebSocket drops are frequent (WiFi ↔ LTE). Show a small banner/dot when disconnected so the user isn't typing into a dead connection. The WebSocket adapter already has reconnect logic — we just need to surface the state to the UI.

Wire into the existing `ws.onclose` / `ws.onopen` events in `createWebSocketAdapter`:

```typescript
// Add a connection status callback to the adapter
onConnectionChange?: (connected: boolean) => void

// In connect():
ws.onopen = () => { onConnectionChange?.(true); ... }
ws.onclose = () => { onConnectionChange?.(false); ... }
```

Render as a thin toast or top-bar when disconnected: "Reconnecting..." that auto-dismisses on reconnect.

## Implementation Order

1. Add viewport meta tags to HTML files
2. Add `--static-dir` flag + static file serving to `ApiServer`
3. Update browser entry point to auto-detect server URL
4. Add `useIsMobile` hook
5. Add mobile layout branch in `App.tsx` (single-column + drawer sidebar)
6. Add mobile CSS overrides (font size, touch targets)
7. Create `cloud/` directory with Dockerfile, wrangler.jsonc, Worker
8. Test locally: build frontend, run server with `--static-dir`, verify desktop + mobile
9. Document deploy steps in `cloud/README.md`

## What Changes

| Area | Change |
|------|--------|
| `api-server.ts` | Add optional `--static-dir` static file serving (~30 lines) |
| `dev/main.tsx` | Auto-detect serverUrl (1 line) |
| `index.html` (x2) | Viewport meta tag (1 line each) |
| `App.tsx` | Mobile layout branch (~20 lines) |
| `useIsMobile.ts` | New hook (~15 lines) |
| `design-tokens.css` | Mobile font size overrides (~5 lines) |
| `ws-adapter.ts` | Expose connection status callback (~5 lines) |
| `ConnectionStatus.tsx` | New component — "Reconnecting..." banner (~20 lines) |
| `cloud/` | New deployment package (3 new files) |

## What Stays Unchanged

- **`@parlour/server`** — Zero logic changes. Same ChatRegistry, PtyManager, lifecycle.
- **`@parlour/platform`** — Zero changes. WebSocket adapter already works with any URL.
- **Local desktop experience** — Completely unaffected. Tauri and browser dev work exactly as before.
- **Data model** — No new fields. Cloud runs the same server, same chat records.

## Deploy Steps (for the user)

```bash
# 1. Clone parlour
git clone https://github.com/cdonohue/parlour && cd parlour

# 2. Deploy to your Cloudflare account
cd cloud
npx wrangler deploy

# 3. Visit your cloud instance
# → https://parlour-cloud.<your-subdomain>.workers.dev
```

No auth for MVP — the user controls their own Cloudflare account and can add Cloudflare Access if they want to restrict access.

## Future Extensions

- **Other providers**: The Dockerfile works with any container host (Fly.io, Railway, AWS ECS). Just need a different deployment config instead of wrangler.jsonc.
- **R2 persistence**: Mount R2 bucket for workspace persistence across container sleep/wake cycles.
- **Auth**: Add Cloudflare Access or simple bearer token middleware when needed.
