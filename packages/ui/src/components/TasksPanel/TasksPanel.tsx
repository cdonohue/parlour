import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Trash2, Plus, Sparkles, Play } from 'lucide-react'
import type { Schedule } from '../../types'
import { describeCron, describeOnce, nlToCron } from '../../utils/describe-cron'
import { Button } from '../../primitives/Button/Button'
import { Toggle } from '../../primitives/Toggle/Toggle'
import { HStack, VStack } from '../../primitives/Stack/Stack'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './TasksPanel.module.css'

type ScheduleTrigger = Schedule['trigger']
type ScheduleUpdate = { name?: string; prompt?: string; project?: string; trigger?: ScheduleTrigger; llmCommand?: string }

const CRON_FIELDS = ['min', 'hour', 'day', 'mon', 'dow'] as const
const CRON_LABELS = ['Min', 'Hour', 'Day', 'Mon', 'Wkday']

function parseCron(cron: string): string[] {
  const parts = cron.trim().split(/\s+/)
  return CRON_FIELDS.map((_, i) => parts[i] ?? '*')
}

const SCRAMBLE_CHARS = '0123456789*/-,'
const SCRAMBLE_INTERVAL = 50
const SETTLE_STAGGER = 120

function useScramble(target: string[], scrambling: boolean): [string[], boolean] {
  const [display, setDisplay] = useState(target)
  const [settling, setSettling] = useState(false)
  const settled = useRef<boolean[]>(target.map(() => true))
  const targetRef = useRef(target)
  const wasScrambling = useRef(false)
  targetRef.current = target

  useEffect(() => {
    if (scrambling) {
      wasScrambling.current = true
      setSettling(false)
      settled.current = target.map(() => false)
      const id = setInterval(() => {
        setDisplay(
          targetRef.current.map((v) => {
            const len = Math.max(1, v.length)
            return Array.from({ length: len }, () => SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]).join('')
          }),
        )
      }, SCRAMBLE_INTERVAL)
      return () => clearInterval(id)
    }

    if (wasScrambling.current) {
      wasScrambling.current = false
      settled.current = target.map(() => false)
      setSettling(true)
      const timers = target.map((_, i) =>
        setTimeout(() => {
          settled.current[i] = true
          setDisplay((prev) => prev.map((v, j) => settled.current[j] ? targetRef.current[j] : v))
          if (settled.current.every(Boolean)) setSettling(false)
        }, SETTLE_STAGGER * (i + 1)),
      )
      const id = setInterval(() => {
        if (settled.current.every(Boolean)) { clearInterval(id); return }
        setDisplay((prev) =>
          prev.map((v, i) => {
            if (settled.current[i]) return targetRef.current[i]
            const len = Math.max(1, targetRef.current[i].length)
            return Array.from({ length: len }, () => SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]).join('')
          }),
        )
      }, SCRAMBLE_INTERVAL)
      return () => { timers.forEach(clearTimeout); clearInterval(id) }
    }

    setDisplay(target)
    setSettling(false)
  }, [scrambling, target.join(' ')])

  const animating = scrambling || settling
  return [animating ? display : target, animating]
}

interface TasksPanelProps {
  schedules: Schedule[]
  defaultLlm: string
  onAdd: () => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, partial: ScheduleUpdate) => void
  onRunNow: (id: string) => void
  onGenerateCron?: (description: string) => Promise<string | null>
}

export function TasksPanel({ schedules, defaultLlm, onAdd, onToggle, onDelete, onUpdate, onRunNow, onGenerateCron }: TasksPanelProps) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Tasks</span>
        <button className={styles.addBtn} onClick={onAdd}><Plus size={14} /></button>
      </div>
      {schedules.length === 0 && (
        <div className={styles.empty}>
          No tasks yet.
          <Button variant="ghost" size="sm" onClick={onAdd}>Create one</Button>
        </div>
      )}
      <div className={styles.grid}>
        <AnimatePresence initial={false}>
          {schedules.map((s) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <TaskCard
                schedule={s}
                defaultLlm={defaultLlm}
                onToggle={onToggle}
                onDelete={onDelete}
                onUpdate={onUpdate}
                onRunNow={onRunNow}
                onGenerateCron={onGenerateCron}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

const ONCE_FIELDS = ['mon', 'day', 'hour', 'min'] as const
const ONCE_LABELS = ['Mon', 'Day', 'Hour', 'Min']

function defaultOnceFields(): string[] {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return [String(d.getMonth() + 1), String(d.getDate()), String(d.getHours()), '0']
}

function parseOnceFields(iso: string): string[] {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return defaultOnceFields()
  return [String(d.getMonth() + 1), String(d.getDate()), String(d.getHours()), String(d.getMinutes())]
}

function onceFieldsToIso(fields: string[]): string | null {
  const [mon, day, hour, min] = fields.map(Number)
  if ([mon, day, hour, min].some(isNaN)) return null
  const now = new Date()
  const d = new Date(now.getFullYear(), mon - 1, day, hour, min, 0, 0)
  if (d < now) d.setFullYear(d.getFullYear() + 1)
  return d.toISOString()
}

function TaskCard({
  schedule: s,
  defaultLlm,
  onToggle,
  onDelete,
  onUpdate,
  onRunNow,
  onGenerateCron,
}: {
  schedule: Schedule
  defaultLlm: string
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, partial: ScheduleUpdate) => void
  onRunNow: (id: string) => void
  onGenerateCron?: (description: string) => Promise<string | null>
}) {
  const [draftName, setDraftName] = useState(s.name)
  const [draftPrompt, setDraftPrompt] = useState(s.prompt)
  const [draftLlm, setDraftLlm] = useState(s.llmCommand ?? '')
  const [draftProject, setDraftProject] = useState(s.project ?? '')
  const [draftCronFields, setDraftCronFields] = useState(() => parseCron(s.trigger.type === 'cron' ? s.trigger.cron : '* * * * *'))
  const [draftOnceFields, setDraftOnceFields] = useState(() => s.trigger.type === 'once' ? parseOnceFields(s.trigger.at) : defaultOnceFields())
  const [nlInput, setNlInput] = useState('')
  const [scrambling, setScrambling] = useState(false)
  const cronRefs = useRef<(HTMLInputElement | null)[]>([])
  const onceRefs = useRef<(HTMLInputElement | null)[]>([])
  const [displayFields, animating] = useScramble(draftCronFields, scrambling)
  const isCron = s.trigger.type === 'cron'

  const commitName = useCallback(() => {
    const trimmed = draftName.trim()
    if (trimmed && trimmed !== s.name) {
      onUpdate(s.id, { name: trimmed })
    } else {
      setDraftName(s.name)
    }
  }, [draftName, s.id, s.name, onUpdate])

  const commitPrompt = useCallback(() => {
    const trimmed = draftPrompt.trim()
    if (trimmed && trimmed !== s.prompt) {
      onUpdate(s.id, { prompt: trimmed })
    } else {
      setDraftPrompt(s.prompt)
    }
  }, [draftPrompt, s.id, s.prompt, onUpdate])

  const commitLlm = useCallback(() => {
    const trimmed = draftLlm.trim()
    if (trimmed !== (s.llmCommand ?? '')) {
      onUpdate(s.id, { llmCommand: trimmed })
    }
  }, [draftLlm, s.id, s.llmCommand, onUpdate])

  const commitCron = useCallback(() => {
    const joined = draftCronFields.join(' ').trim()
    if (!joined) {
      setDraftCronFields(parseCron(s.trigger.type === 'cron' ? s.trigger.cron : '* * * * *'))
      return
    }
    if (s.trigger.type === 'cron' && joined === s.trigger.cron) return
    onUpdate(s.id, { trigger: { type: 'cron', cron: joined } })
  }, [draftCronFields, s.id, s.trigger, onUpdate])

  const commitOnce = useCallback(() => {
    const iso = onceFieldsToIso(draftOnceFields)
    if (!iso) return
    if (s.trigger.type === 'once' && s.trigger.at === iso) return
    onUpdate(s.id, { trigger: { type: 'once', at: iso } })
  }, [draftOnceFields, s.id, s.trigger, onUpdate])

  const updateOnceField = useCallback((index: number, value: string) => {
    setDraftOnceFields((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }, [])

  const switchTriggerType = useCallback((type: 'cron' | 'once') => {
    if (type === 'cron') {
      onUpdate(s.id, { trigger: { type: 'cron', cron: '0 9 * * *' } })
      setDraftCronFields(parseCron('0 9 * * *'))
    } else {
      const fields = defaultOnceFields()
      setDraftOnceFields(fields)
      const iso = onceFieldsToIso(fields)
      if (iso) onUpdate(s.id, { trigger: { type: 'once', at: iso } })
    }
  }, [s.id, onUpdate])

  const updateCronField = useCallback((index: number, value: string) => {
    setDraftCronFields((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }, [])

  const applyResult = useCallback((cron: string) => {
    setDraftCronFields(parseCron(cron))
    onUpdate(s.id, { trigger: { type: 'cron', cron } })
    setNlInput('')
  }, [s.id, onUpdate])

  const handleGenerate = useCallback(async () => {
    if (!nlInput.trim()) return
    const local = nlToCron(nlInput.trim())
    if (local) {
      setScrambling(true)
      applyResult(local)
      requestAnimationFrame(() => setScrambling(false))
      return
    }
    if (!onGenerateCron) return
    setScrambling(true)
    try {
      const result = await onGenerateCron(nlInput.trim())
      if (result) applyResult(result)
    } finally {
      setScrambling(false)
    }
  }, [nlInput, applyResult, onGenerateCron])

  const commitProject = useCallback(() => {
    const trimmed = draftProject.trim()
    if (trimmed !== (s.project ?? '')) {
      onUpdate(s.id, { project: trimmed })
    }
  }, [draftProject, s.id, s.project, onUpdate])

  const triggerDesc = s.trigger.type === 'cron' ? describeCron(s.trigger.cron) : describeOnce(s.trigger.at)

  return (
    <VStack gap={4} className={styles.card}>
      <HStack gap={3} align="flex-start">
        <VStack flex="1" style={{ minWidth: 0 }}>
          <input
            className={styles.cardNameInput}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') { setDraftName(s.name); e.currentTarget.blur() }
            }}
            spellCheck={false}
          />
          <div className={styles.cardTrigger}>{triggerDesc}</div>
        </VStack>
        {!s.enabled && !s.prompt.trim() ? (
          <Tooltip label="Add a prompt to enable">
            <span><Toggle value={s.enabled} onChange={() => onToggle(s.id)} /></span>
          </Tooltip>
        ) : (
          <Toggle value={s.enabled} onChange={() => onToggle(s.id)} />
        )}
      </HStack>

      <input
        className={styles.llmInput}
        value={draftLlm}
        onChange={(e) => setDraftLlm(e.target.value)}
        onBlur={commitLlm}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { setDraftLlm(s.llmCommand ?? ''); e.currentTarget.blur() }
        }}
        placeholder={defaultLlm}
        spellCheck={false}
      />

      <textarea
        className={styles.promptTextarea}
        value={draftPrompt}
        onChange={(e) => setDraftPrompt(e.target.value)}
        onBlur={commitPrompt}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraftPrompt(s.prompt); e.currentTarget.blur() } }}
        rows={4}
      />

      <VStack gap={2}>
        <HStack gap={1} className={styles.triggerToggle}>
          <button
            className={`${styles.triggerBtn} ${isCron ? styles.triggerBtnActive : ''}`}
            onClick={() => switchTriggerType('cron')}
          >
            Recurring
          </button>
          <button
            className={`${styles.triggerBtn} ${!isCron ? styles.triggerBtnActive : ''}`}
            onClick={() => switchTriggerType('once')}
          >
            Once
          </button>
        </HStack>
        {isCron ? (
          <HStack gap={2}>
            {CRON_FIELDS.map((_, i) => (
              <VStack key={i} gap={1} align="center" flex="1" style={{ minWidth: 0 }}>
                <span className={styles.cronLabel}>{CRON_LABELS[i]}</span>
                <input
                  ref={(el) => { cronRefs.current[i] = el }}
                  className={`${styles.cronCell} ${animating ? styles.cronCellScrambling : ''}`}
                  value={displayFields[i]}
                  onChange={(e) => updateCronField(i, e.target.value)}
                  onBlur={commitCron}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') { setDraftCronFields(parseCron(s.trigger.type === 'cron' ? s.trigger.cron : '* * * * *')); e.currentTarget.blur() }
                    if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) cronRefs.current[i + 1]?.focus()
                    if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) cronRefs.current[i - 1]?.focus()
                  }}
                  readOnly={animating}
                  spellCheck={false}
                />
              </VStack>
            ))}
          </HStack>
        ) : (
          <HStack gap={2}>
            {ONCE_FIELDS.map((_, i) => (
              <VStack key={i} gap={1} align="center" flex="1" style={{ minWidth: 0 }}>
                <span className={styles.cronLabel}>{ONCE_LABELS[i]}</span>
                <input
                  ref={(el) => { onceRefs.current[i] = el }}
                  className={styles.cronCell}
                  value={draftOnceFields[i]}
                  onChange={(e) => updateOnceField(i, e.target.value)}
                  onBlur={commitOnce}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') { setDraftOnceFields(s.trigger.type === 'once' ? parseOnceFields(s.trigger.at) : defaultOnceFields()); e.currentTarget.blur() }
                    if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) onceRefs.current[i + 1]?.focus()
                    if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) onceRefs.current[i - 1]?.focus()
                  }}
                  spellCheck={false}
                />
              </VStack>
            ))}
          </HStack>
        )}
        <HStack gap={2} align="center" className={!isCron ? styles.nlRowHidden : undefined}>
          <input
            className={styles.nlInput}
            value={nlInput}
            onChange={(e) => setNlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate() }}
            placeholder="e.g. every weekday at 9am"
            disabled={animating}
          />
          <Tooltip label="Generate cron">
            <button
              className={styles.generateBtn}
              onClick={handleGenerate}
              disabled={animating || !nlInput.trim()}
            >
              <Sparkles size={12} />
            </button>
          </Tooltip>
        </HStack>
      </VStack>

      <input
        className={styles.llmInput}
        value={draftProject}
        onChange={(e) => setDraftProject(e.target.value)}
        onBlur={commitProject}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { setDraftProject(s.project ?? ''); e.currentTarget.blur() }
        }}
        placeholder="Project path or URL (optional)"
        spellCheck={false}
      />

      <HStack align="center" justify="space-between" className={styles.cardFooter}>
        <span className={styles.lastRun}>
          {s.lastRunAt ? `${new Date(s.lastRunAt).toLocaleString()}${s.lastRunStatus ? ` — ${s.lastRunStatus}` : ''}` : 'Never run'}
        </span>
        <HStack gap={3} align="center">
          <Tooltip label="Run now">
            <button
              className={styles.runBtn}
              onClick={() => onRunNow(s.id)}
              disabled={!s.prompt.trim()}
            >
              <Play size={13} />
            </button>
          </Tooltip>
          <Tooltip label="Delete">
            <button className={styles.deleteBtn} onClick={() => onDelete(s.id)}>
              <Trash2 size={13} />
            </button>
          </Tooltip>
        </HStack>
      </HStack>
    </VStack>
  )
}
