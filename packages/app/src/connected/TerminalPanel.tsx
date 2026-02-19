import { useEffect, useMemo, useState } from 'react'
import { TerminalPanel as TerminalPanelUI, getTerminalTheme, deriveShortTitle } from '@parlour/ui'
import { usePlatform } from '@parlour/platform'
import { useAppStore } from '../store/app-store'

function useResolvedTheme(): 'dark' | 'light' {
  const theme = useAppStore((s) => s.settings.theme)
  const platform = usePlatform()
  const [systemMode, setSystemMode] = useState<'dark' | 'light'>(
    () => document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  )

  useEffect(() => {
    if (theme !== 'system') return
    return platform.theme.onResolvedChanged(setSystemMode)
  }, [theme, platform])

  return theme === 'system' ? systemMode : theme
}

interface Props {
  ptyId: string
  active: boolean
}

export function TerminalPanel({ ptyId, active }: Props) {
  const platform = usePlatform()
  const fontSize = useAppStore((s) => s.settings.terminalFontSize)
  const fontFamily = useAppStore((s) => s.settings.terminalFontFamily)
  const updateChat = useAppStore((s) => s.updateChat)

  const resolvedMode = useResolvedTheme()
  const terminalTheme = useMemo(() => getTerminalTheme(resolvedMode), [resolvedMode])

  useEffect(() => {
    platform.theme.setResolved(resolvedMode)
  }, [resolvedMode, platform])

  useEffect(() => {
    return platform.pty.onFirstInput(ptyId, (input) => {
      const s = useAppStore.getState()
      const chat = s.chats.find((c) => c.ptyId === ptyId)
      if (!chat || chat.name !== 'New Chat') return

      updateChat(chat.id, { name: deriveShortTitle(input) })

      platform.chat.generateTitle(input).then((title) => {
        if (title) updateChat(chat.id, { name: title })
      })
    })
  }, [ptyId, updateChat, platform])

  return (
    <TerminalPanelUI
      ptyId={ptyId}
      active={active}
      fontSize={fontSize}
      fontFamily={fontFamily}
      terminalTheme={terminalTheme}
      writePty={platform.pty.write}
      resizePty={platform.pty.resize}
      subscribePtyData={platform.pty.onData}
      getBuffer={platform.pty.getBuffer}
      onLinkClick={platform.shell.openExternal}
    />
  )
}
