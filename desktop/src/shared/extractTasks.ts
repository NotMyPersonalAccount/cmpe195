const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
] as const

const WEEKDAY_RE = WEEKDAYS.join('|')

const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11
}

const TASK_VERBS =
  /\b(submit|turn in|hand in|upload|read|study|review|complete|finish|write|prepare|practice|watch|attend|meet|email|send|bring|print|register|sign up|start|work on|revise|edit|solve|implement|code|debug|memorize|outline|draft|rewrite|annotate|summarize|present|rehearse|schedule)\b/i

const TASK_NOUNS =
  /\b(homework|assignment|quiz|exam|midterm|final|project|lab|paper|essay|report|problem set|pset|worksheet|reading|chapter|deadline|due date|presentation|problem|exercise|portfolio)\b/i

const NEED_TO =
  /\b(need to|have to|should|must|make sure( you| to)?|don't forget to|do not forget to|remember to|be sure to|i want you( all)? to|you will need to|you're expected to|you are expected to|please)\b/i

const LECTURE_FILLER =
  /\b(today (we|i)|we('re| are) going to (talk|discuss|cover|look|go over)|this lecture|let's talk about|i want to talk about|as i (said|mentioned)|last (time|class|lecture))\b/i

const QUESTION = /^\s*(who|what|when|where|why|how|does|do|did|is|are|can|could|would|will)\b.*\?$/i

export type ExtractedTask = {
  description: string
  deadlineIso: string | null
  deadlineLabel: string | null
}

type DeadlineHit = {
  label: string
  iso: string | null
  index: number
  length: number
}

export function extractTasks(transcript: string, recordedAt: Date = new Date()): ExtractedTask[] {
  const units = splitUnits(transcript)
  const found: ExtractedTask[] = []

  for (const unit of units) {
    const cleaned = cleanDescription(unit)
    if (cleaned.split(/\s+/).length < 2) continue

    const deadline = parseDeadline(cleaned, recordedAt)
    const score = scoreUnit(cleaned, Boolean(deadline))
    if (score < 3) continue

    found.push({
      description: capitalize(cleaned),
      deadlineIso: deadline?.iso ?? null,
      deadlineLabel: deadline?.label ?? null
    })
  }

  return dedupe(found).slice(0, 25)
}

function splitUnits(transcript: string): string[] {
  const lines = transcript.replace(/\r/g, '').split(/\n+/)
  const units: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (/^(\d+[\).:]|[-*•])\s+/.test(trimmed)) {
      units.push(trimmed.replace(/^(\d+[\).:]|[-*•])\s+/, ''))
      continue
    }

    const parts = trimmed.split(/(?<=[.!?])\s+(?=[A-Z“"'])/)
    for (const part of parts) {
      const andish = part.split(/\s+;\s+|\s+—\s+/)
      units.push(...andish)
    }
  }

  return units.map((unit) => unit.trim().replace(/^["'“]+|["'”]+$/g, '')).filter(Boolean)
}

function scoreUnit(text: string, hasDeadline: boolean): number {
  let score = 0
  if (TASK_VERBS.test(text)) score += 2
  if (TASK_NOUNS.test(text)) score += 2
  if (NEED_TO.test(text)) score += 2
  if (hasDeadline) score += 2
  if (/\b(due|deadline|by \w+day)\b/i.test(text)) score += 1
  if (QUESTION.test(text) || text.trim().endsWith('?')) score -= 3
  if (LECTURE_FILLER.test(text)) score -= 3
  if (text.split(/\s+/).length < 3) score -= 1
  return score
}

function cleanDescription(text: string): string {
  let out = text.replace(/\s+/g, ' ').trim()
  out = out.replace(/^[.!,;:\s]+|[.!,;:\s]+$/g, '')

  let prev = ''
  while (prev !== out) {
    prev = out
    out = out
      .replace(/^(ok(ay)?|so|um+|uh+|alright|all right|now|anyway|also|and|well),?\s+/i, '')
      .replace(/^(hey|everyone|class|folks|guys),?\s+/i, '')
      .replace(/^(remember|please),?\s+/i, '')
      .replace(/^(you (need to|have to|should|must|will need to)|you're going to need to|you are going to need to)\s+/i, '')
      .replace(/^(i want you( all)? to|make sure( you| to)?|don't forget to|do not forget to|remember to|be sure to)\s+/i, '')
      .replace(/^(the homework is to|your homework is to|the assignment is to)\s+/i, '')
  }

  return out.replace(/\s+/g, ' ').trim()
}

function parseDeadline(text: string, recordedAt: Date): DeadlineHit | null {
  const lower = text.toLowerCase()
  const hits: DeadlineHit[] = []

  const push = (match: RegExpExecArray | null, iso: string | null, label?: string): void => {
    if (!match || match.index === undefined) return
    hits.push({
      label: (label ?? match[0]).replace(/\s+/g, ' ').trim(),
      iso,
      index: match.index,
      length: match[0].length
    })
  }

  push(exec(/\b(today|tonight)\b/i, lower), toIso(recordedAt))
  const tomorrow = addDays(recordedAt, 1)
  push(exec(/\btomorrow\b/i, lower), toIso(tomorrow))

  const nextWeek = exec(/\bnext week\b/i, lower)
  if (nextWeek) push(nextWeek, toIso(upcomingWeekday(addDays(recordedAt, 7), 5)))

  const thisWeek = exec(/\bthis week\b/i, lower)
  if (thisWeek) push(thisWeek, toIso(upcomingWeekday(recordedAt, 5)))

  const endWeek = exec(/\bend of (the )?week\b/i, lower)
  if (endWeek) push(endWeek, toIso(upcomingWeekday(recordedAt, 5)))

  const nextWeekday = new RegExp(`\\bnext (${WEEKDAY_RE})\\b`, 'i')
  let match: RegExpExecArray | null
  const nextDayRe = new RegExp(nextWeekday.source, 'gi')
  while ((match = nextDayRe.exec(lower))) {
    const day = WEEKDAYS.indexOf(match[1].toLowerCase() as (typeof WEEKDAYS)[number])
    push(match, toIso(weekdayOnWeek(recordedAt, day, 1)), match[0])
  }

  const thisDayRe = new RegExp(`\\b(?:this(?: coming)? |coming )?(${WEEKDAY_RE})\\b`, 'gi')
  while ((match = thisDayRe.exec(lower))) {
    if (/^next\s/.test(lower.slice(Math.max(0, match.index - 5), match.index))) continue
    const day = WEEKDAYS.indexOf(match[1].toLowerCase() as (typeof WEEKDAYS)[number])
    push(match, toIso(upcomingWeekday(recordedAt, day)), match[1])
  }

  const inDays = /\bin (\d+|a|one|two|three|four|five|six|seven) days?\b/gi
  while ((match = inDays.exec(lower))) {
    push(match, toIso(addDays(recordedAt, parseCount(match[1]))))
  }

  const inWeeks = /\bin (\d+|a|one|two|three) weeks?\b/gi
  while ((match = inWeeks.exec(lower))) {
    push(match, toIso(addDays(recordedAt, parseCount(match[1]) * 7)))
  }

  const monthNames = Object.keys(MONTHS).join('|')
  const monthDay = new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,\\s*(\\d{4}))?\\b`, 'gi')
  while ((match = monthDay.exec(lower))) {
    const month = MONTHS[match[1].toLowerCase()]
    const day = Number(match[2])
    const year = match[3] ? Number(match[3]) : recordedAt.getFullYear()
    const date = new Date(year, month, day)
    if (!match[3] && date.getTime() + 86400000 < recordedAt.getTime()) {
      date.setFullYear(year + 1)
    }
    push(match, toIso(date))
  }

  const numeric = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g
  while ((match = numeric.exec(lower))) {
    const month = Number(match[1]) - 1
    const day = Number(match[2])
    let year = match[3] ? Number(match[3]) : recordedAt.getFullYear()
    if (year < 100) year += 2000
    if (month < 0 || month > 11 || day < 1 || day > 31) continue
    const date = new Date(year, month, day)
    push(match, toIso(date))
  }

  if (hits.length === 0) return null
  hits.sort((a, b) => b.length - a.length)
  return hits[0]
}

function exec(re: RegExp, text: string): RegExpExecArray | null {
  const copy = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
  copy.lastIndex = 0
  return copy.exec(text)
}

function parseCount(raw: string): number {
  const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }
  if (raw in words) return words[raw]
  return Number(raw)
}

function addDays(from: Date, days: number): Date {
  const next = new Date(from)
  next.setDate(next.getDate() + days)
  return next
}

function upcomingWeekday(from: Date, weekday: number): Date {
  const next = new Date(from)
  const delta = (weekday - next.getDay() + 7) % 7
  next.setDate(next.getDate() + delta)
  return next
}

function weekdayOnWeek(from: Date, weekday: number, weekOffset: number): Date {
  const start = addDays(from, weekOffset * 7)
  const day = start.getDay()
  const sunday = addDays(start, -day)
  return addDays(sunday, weekday)
}

function toIso(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function capitalize(text: string): string {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function dedupe(tasks: ExtractedTask[]): ExtractedTask[] {
  const kept: ExtractedTask[] = []
  for (const task of tasks) {
    const key = normalize(task.description)
    const duplicate = kept.find((item) => {
      const other = normalize(item.description)
      return other === key || other.includes(key) || key.includes(other)
    })
    if (!duplicate) {
      kept.push(task)
      continue
    }
    if (task.description.length > duplicate.description.length) {
      kept[kept.indexOf(duplicate)] = task
    }
  }
  return kept
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
