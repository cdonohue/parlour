import { useEffect, useRef, useState } from 'react'
import styles from './TypewriterText.module.css'

interface TypewriterTextProps {
  text: string
  speed?: number
  className?: string
}

export function TypewriterText({ text, speed = 32, className }: TypewriterTextProps) {
  const [charCount, setCharCount] = useState(text.length)
  const [animating, setAnimating] = useState(false)
  const prevText = useRef(text)

  useEffect(() => {
    if (text === prevText.current) return
    prevText.current = text
    setCharCount(0)
    setAnimating(true)
  }, [text])

  useEffect(() => {
    if (!animating || charCount >= text.length) {
      if (animating) setAnimating(false)
      return
    }
    const timer = setTimeout(() => setCharCount((c) => c + 1), speed)
    return () => clearTimeout(timer)
  }, [animating, charCount, text.length, speed])

  if (!animating) {
    return <span className={`${styles.wrapper} ${className ?? ''}`}>{text}</span>
  }

  return (
    <span className={`${styles.wrapper} ${className ?? ''}`}>
      {text.slice(0, charCount)}
      <span className={styles.cursor} />
      <span className={styles.hidden}>{text.slice(charCount)}</span>
    </span>
  )
}
