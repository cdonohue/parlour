import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import type { ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import styles from './TerminalPanel.module.css'

interface TerminalPanelProps {
  ptyId: string
  active: boolean
  fontSize: number
  fontFamily?: string
  terminalTheme?: ITheme
  writePty: (ptyId: string, data: string) => void
  resizePty: (ptyId: string, cols: number, rows: number) => void
  subscribePtyData: (ptyId: string, cb: (data: string) => void) => () => void
  getBuffer?: (ptyId: string) => Promise<string>
  onLinkClick?: (url: string) => void
}

export function TerminalPanel({ ptyId, active, fontSize, fontFamily, terminalTheme, writePty, resizePty, subscribePtyData, getBuffer, onLinkClick }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termDivRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!termDivRef.current) return
    const termDiv = termDivRef.current!

    let disposed = false
    let unsubData: (() => void) | null = null

    async function setup() {
      try {
        await document.fonts.ready

        if (disposed) return

        const resolvedFont = `'${fontFamily || 'Geist Mono'}', 'SF Mono', Menlo, monospace`
        const isLight = terminalTheme?.background === '#ffffff'
        const term = new Terminal({
          fontSize,
          fontFamily: resolvedFont,
          fontWeight: isLight ? '600' : '500',
          fontWeightBold: isLight ? '800' : '700',
          lineHeight: 1.35,
          cursorBlink: true,
          cursorStyle: 'bar',
          cursorWidth: 2,
          scrollback: 10000,
          allowTransparency: true,
          minimumContrastRatio: isLight ? 4.5 : 1,
          customGlyphs: true,
          drawBoldTextInBrightColors: false,
          theme: terminalTheme ?? {
            background: '#0a0a0b',
            foreground: '#ededef',
            cursor: '#ededef',
            selectionBackground: 'rgba(110, 106, 222, 0.3)',
            black: '#0a0a0b',
            red: '#e5484d',
            green: '#3dd68c',
            yellow: '#d4a84b',
            blue: '#6e6ade',
            magenta: '#8b7ec8',
            cyan: '#5eb0ef',
            white: '#a0a0a8',
            brightBlack: '#5c5c66',
            brightRed: '#e5484d',
            brightGreen: '#3dd68c',
            brightYellow: '#d4a84b',
            brightBlue: '#6e6ade',
            brightMagenta: '#8b7ec8',
            brightCyan: '#5eb0ef',
            brightWhite: '#ededef',
          },
        })

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.loadAddon(new WebLinksAddon((_e, uri) => {
          if (onLinkClick) onLinkClick(uri)
          else window.open(uri)
        }))

        term.open(termDiv)

        try {
          term.loadAddon(new WebglAddon())
        } catch {
          // WebGL not available, canvas fallback is fine
        }

        if (disposed) {
          term.dispose()
          return
        }

        let fitAttempts = 0
        function tryFit() {
          if (disposed) return
          if (termDiv.clientWidth > 0 && termDiv.clientHeight > 0) {
            fitAddon.fit()
            setLoading(false)
          } else if (++fitAttempts < 30) {
            requestAnimationFrame(tryFit)
          } else {
            setLoading(false)
          }
        }
        requestAnimationFrame(tryFit)

        let resizeRaf: number | null = null
        const resizeObserver = new ResizeObserver(() => {
          if (disposed) return
          if (resizeRaf) cancelAnimationFrame(resizeRaf)
          resizeRaf = requestAnimationFrame(() => {
            resizeRaf = null
            if (!disposed) fitAddon.fit()
          })
        })
        resizeObserver.observe(termDiv)

        term.onData((data) => {
          writePty(ptyId, data)
        })

        term.onResize(({ cols, rows }) => {
          resizePty(ptyId, cols, rows)
        })

        if (getBuffer) {
          const buf = await getBuffer(ptyId)
          if (disposed) return
          if (buf) term.write(buf)
        }

        unsubData = subscribePtyData(ptyId, (data) => {
          if (disposed) return
          term.write(data)
        })

        termRef.current = term
        fitAddonRef.current = fitAddon

        setTimeout(() => {
          if (!disposed) term.focus()
        }, 50)
      } catch (err) {
        console.error('Failed to initialize terminal:', err)
        if (!disposed) setLoading(false)
      }
    }

    setup()

    return () => {
      disposed = true
      unsubData?.()
      termRef.current?.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, [ptyId])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontSize = fontSize
    fitAddonRef.current?.fit()
  }, [fontSize])

  useEffect(() => {
    if (!termRef.current || !terminalTheme) return
    const light = terminalTheme.background === '#ffffff'
    termRef.current.options.fontWeight = light ? '600' : '500'
    termRef.current.options.fontWeightBold = light ? '800' : '700'
    termRef.current.options.minimumContrastRatio = light ? 4.5 : 1
    termRef.current.options.theme = terminalTheme
    termRef.current.refresh(0, termRef.current.rows - 1)
  }, [terminalTheme])

  useEffect(() => {
    if (!active || !termRef.current) return
    fitAddonRef.current?.fit()
    termRef.current?.focus()
  }, [active])

  return (
    <div
      className={`${styles.terminalContainer} ${active ? styles.active : styles.hidden}`}
      ref={containerRef}
    >
      <div ref={termDivRef} className={styles.terminalInner} />
      {loading && (
        <div className={styles.loading}>
          <span className={styles.loadingDot}>●</span>
          &nbsp;Loading terminal...
        </div>
      )}
    </div>
  )
}
