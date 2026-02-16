import { useEffect, useMemo, useState } from 'react'
import { TerminalPanel as TerminalPanelUI, getTerminalTheme } from '@parlour/ui'
import { useAppStore } from '../store/app-store'
import { deriveShortTitle } from '@parlour/ui'

function useResolvedTheme(): 'dark' | 'light' {
  const theme = useAppStore((s) => s.settings.theme)
  const [systemMode, setSystemMode] = useState<'dark' | 'light'>(
    () => document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  )

  useEffect(() => {
    if (theme !== 'system') return
    return window.api.theme.onResolvedChanged(setSystemMode)
  }, [theme])

  return theme === 'system' ? systemMode : theme
}

interface Props {
  ptyId: string
  active: boolean
}

export function TerminalPanel({ ptyId, active }: Props) {
  const fontSize = useAppStore((s) => s.settings.terminalFontSize)
  const fontFamily = useAppStore((s) => s.settings.terminalFontFamily)
  const setTabTitle = useAppStore((s) => s.setTabTitle)
  const updateChat = useAppStore((s) => s.updateChat)

  const resolvedMode = useResolvedTheme()
  const terminalTheme = useMemo(() => getTerminalTheme(resolvedMode), [resolvedMode])

  useEffect(() => {
    return window.api.pty.onTitle(ptyId, (title) => {
      setTabTitle(ptyId, title)
    })
  }, [ptyId, setTabTitle])

  useEffect(() => {
    return window.api.pty.onFirstInput(ptyId, (input) => {
      const s = useAppStore.getState()
      const chat = s.chats.find((c) => c.ptyId === ptyId)
      if (!chat || chat.name !== 'New Chat') return

      updateChat(chat.id, { name: deriveShortTitle(input) })

      window.api.chat.generateTitle(input).then((title) => {
        if (title) updateChat(chat.id, { name: title })
      })
    })
  }, [ptyId, updateChat])

  return (
    <TerminalPanelUI
      ptyId={ptyId}
      active={active}
      fontSize={fontSize}
      fontFamily={fontFamily}
      terminalTheme={terminalTheme}
      writePty={window.api.pty.write}
      resizePty={window.api.pty.resize}
      subscribePtyData={window.api.pty.onData}
      getBuffer={window.api.pty.getBuffer}
      onLinkClick={window.api.shell.openExternal}
    />
  )
}
