const ANSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\].*?(?:\x07|\x1b\\)|\x1b[()][0-9A-B]|\x1b./g
const CTRL_RE = /[\x00-\x08\x0e-\x1f\x7f]/g
const FILLER_RE = /^(?:please\s+|can you\s+|i need you to\s+|could you\s+|i want you to\s+)/i
const CLAUSE_END_RE = /[.,;:\n]/

export function deriveShortTitle(prompt: string): string {
  let text = prompt.replace(ANSI_RE, '').replace(CTRL_RE, '').trim().replace(FILLER_RE, '')
  if (!text) return prompt.slice(0, 50)

  const clauseMatch = CLAUSE_END_RE.exec(text)
  if (clauseMatch && clauseMatch.index > 0 && clauseMatch.index <= 50) {
    text = text.slice(0, clauseMatch.index)
  } else if (text.length > 50) {
    const spaceIdx = text.lastIndexOf(' ', 50)
    text = text.slice(0, spaceIdx > 20 ? spaceIdx : 50)
  }

  return text.charAt(0).toUpperCase() + text.slice(1)
}
