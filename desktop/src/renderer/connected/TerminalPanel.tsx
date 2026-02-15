import { useEffect } from 'react'
import { TerminalPanel as TerminalPanelUI } from '@parlour/ui'
import { useAppStore } from '../store/app-store'
import { deriveShortTitle } from '@parlour/ui'

interface Props {
  ptyId: string
  active: boolean
}

export function TerminalPanel({ ptyId, active }: Props) {
  const fontSize = useAppStore((s) => s.settings.terminalFontSize)
  const fontFamily = useAppStore((s) => s.settings.terminalFontFamily)
  const setTabTitle = useAppStore((s) => s.setTabTitle)
  const updateChat = useAppStore((s) => s.updateChat)

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
      writePty={window.api.pty.write}
      resizePty={window.api.pty.resize}
      subscribePtyData={window.api.pty.onData}
      getBuffer={window.api.pty.getBuffer}
    />
  )
}
