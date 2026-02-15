const HOUR_MINUTE_RE = /^(\d+)\s+(\d+)\s+/

function formatTime(hour: number, minute: number): string {
  const h = hour % 12 || 12
  const ampm = hour < 12 ? 'AM' : 'PM'
  return minute === 0 ? `${h}:00 ${ampm}` : `${h}:${String(minute).padStart(2, '0')} ${ampm}`
}

export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5) return cron

  const [min, hour, dom, mon, dow] = parts
  const isWild = (v: string) => v === '*'

  if (isWild(min) && isWild(hour) && isWild(dom) && isWild(mon) && isWild(dow)) return 'Every minute'
  if (min.startsWith('*/') && isWild(hour) && isWild(dom) && isWild(mon) && isWild(dow)) return `Every ${min.slice(2)} minutes`
  if (min === '0' && hour.startsWith('*/') && isWild(dom) && isWild(mon) && isWild(dow)) return `Every ${hour.slice(2)} hours`
  if (isWild(min) && hour.startsWith('*/') && isWild(dom) && isWild(mon) && isWild(dow)) return `Every ${hour.slice(2)} hours`
  if (min === '0' && isWild(hour) && isWild(dom) && isWild(mon) && isWild(dow)) return 'Every hour'

  if (!HOUR_MINUTE_RE.test(cron)) return cron

  const h = Number(hour)
  const m = Number(min)
  if (isNaN(h) || isNaN(m)) return cron

  const time = formatTime(h, m)

  if (isWild(dom) && isWild(mon) && isWild(dow)) return `Daily at ${time}`
  if (isWild(dom) && isWild(mon) && dow === '1-5') return `Weekdays at ${time}`
  if (isWild(dom) && isWild(mon) && dow === '0,6') return `Weekends at ${time}`
  if (isWild(dom) && isWild(mon) && /^\d$/.test(dow)) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return `${days[Number(dow)]}s at ${time}`
  }
  const hashMatch = dow.match(/^(\d)#(\d)$/)
  if (isWild(dom) && isWild(mon) && hashMatch) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const ordinals = ['', '1st', '2nd', '3rd', '4th', '5th']
    return `${ordinals[Number(hashMatch[2])] ?? hashMatch[2] + 'th'} ${days[Number(hashMatch[1])]} at ${time}`
  }

  return cron
}

const DAY_MAP: Record<string, string> = {
  sun: '0', sunday: '0', mon: '1', monday: '1', tue: '2', tuesday: '2',
  wed: '3', wednesday: '3', thu: '4', thursday: '4', fri: '5', friday: '5',
  sat: '6', saturday: '6',
}
const WEEKDAY_RE = /\b(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/i
const TIME_RE = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i
const EVERY_N_RE = /\bevery\s+(\d+)\s*(min(?:ute)?s?|hours?|h)\b/i
const ORDINAL_RE = /\b(\d+)(?:st|nd|rd|th)\b/

function parseTime(s: string): { h: number; m: number } {
  const match = s.match(TIME_RE)
  if (!match) return { h: 9, m: 0 }
  let h = Number(match[1])
  const m = Number(match[2] ?? 0)
  const ampm = match[3]?.toLowerCase()
  if (ampm === 'pm' && h < 12) h += 12
  if (ampm === 'am' && h === 12) h = 0
  return { h, m }
}

export function nlToCron(input: string): string | null {
  const s = input.toLowerCase().trim()

  const everyN = s.match(EVERY_N_RE)
  if (everyN) {
    const n = everyN[1]
    const unit = everyN[2]
    if (unit.startsWith('h')) return `0 */${n} * * *`
    return `*/${n} * * * *`
  }

  if (/\bevery\s+hour\b/.test(s)) return '0 * * * *'
  if (/\bevery\s+minute\b/.test(s)) return '* * * * *'

  const { h, m } = parseTime(s)
  const dayMatch = s.match(WEEKDAY_RE)

  if (/\beveryday\b|\bevery\s+day\b|\bdaily\b/.test(s)) return `${m} ${h} * * *`
  if (/\bweekday\b|\bweekdays\b|\bmon\s*-\s*fri\b|\bmonday\s*(through|to|-)\s*friday\b/.test(s)) return `${m} ${h} * * 1-5`
  if (/\bweekend\b|\bweekends\b/.test(s)) return `${m} ${h} * * 0,6`
  if (/\bweekly\b|\bevery\s+week\b/.test(s)) {
    const dow = dayMatch ? DAY_MAP[dayMatch[1].toLowerCase()] : '1'
    return `${m} ${h} * * ${dow}`
  }
  if (/\bmonthly\b|\bevery\s+month\b/.test(s)) {
    const ord = s.match(ORDINAL_RE)
    const dom = ord ? ord[1] : '1'
    return `${m} ${h} ${dom} * *`
  }

  const ord = s.match(ORDINAL_RE)

  if (dayMatch && ord) {
    const dow = DAY_MAP[dayMatch[1].toLowerCase()]
    return `${m} ${h} * * ${dow}#${ord[1]}`
  }

  if (dayMatch) {
    const dow = DAY_MAP[dayMatch[1].toLowerCase()]
    return `${m} ${h} * * ${dow}`
  }

  if (ord) return `${m} ${h} ${ord[1]} * *`

  return null
}

export function describeOnce(isoDate: string): string {
  const d = new Date(isoDate)
  if (isNaN(d.getTime())) return isoDate
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getDate()} at ${formatTime(d.getHours(), d.getMinutes())}`
}
