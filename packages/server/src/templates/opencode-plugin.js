export const ChoralePlugin = async ({}) => {
  const chatId = process.env.CHORALE_CHAT_ID
  const portFile = `${process.env.HOME}/.chorale/.mcp-port`

  async function notify(event, data) {
    if (!chatId) return
    try {
      const fs = await import('node:fs')
      const port = fs.readFileSync(portFile, 'utf-8').trim()
      const body = JSON.stringify({ chat_id: chatId, event, data })
      fetch(`http://localhost:${port}/api/hooks?caller=${chatId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(2000),
      }).catch(() => {})
    } catch {}
  }

  return {
    hooks: {
      'tool.execute.before': async (event) => notify('pre-tool-use', { tool: event?.tool }),
      'tool.execute.after': async (event) => notify('post-tool-use', { tool: event?.tool }),
      'session.idle': async () => notify('stop'),
      'session.error': async () => notify('stop', { reason: 'error' }),
    }
  }
}
