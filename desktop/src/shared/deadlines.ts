const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
] as const

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

export type Deadline = {
  label: string
  iso: string
  index: number
  length: number
}

type Candidate = Deadline

/** Resolve the most specific date phrase in a task against the recording date. */
export function parseDeadline(text: string, recordedAt: Date): Deadline | null {
  const lower = text.toLowerCase()
  const hits: Candidate[] = []
  const add = (match: RegExpExecArray | null, date: Date, label?: string): void => {
    if (
      !match ||
      match.index === undefined ||
      isNegated(lower, match.index) ||
      !isValidDate(date)
    ) return
    hits.push({
      label: (label ?? match[0]).replace(/\s+/g, ' ').trim(),
      iso: toIso(date),
      index: match.index,
      length: match[0].length
    })
  }

  add(first(/\b(today|tonight)\b/i, lower), startOfDay(recordedAt))
  add(
    first(/\b(day after tomorrow|in (?:2|two) days|(?:2|two) days (?:from now|later)|next next day)\b/i, lower),
    addDays(recordedAt, 2)
  )
  add(first(/\btomorrow\b/i, lower), addDays(recordedAt, 1))

  add(first(/\bnext week\b/i, lower), weekdayInWeek(recordedAt, 5, 1))
  add(first(/\b(this week|end of (the )?week)\b/i, lower), upcomingWeekday(recordedAt, 5))
  add(first(/\bnext weekend\b/i, lower), weekdayInWeek(recordedAt, 6, 1))
  add(first(/\b(this |the |over the )?weekend\b/i, lower), upcomingWeekday(recordedAt, 6))

  const weekdayNames = WEEKDAYS.join('|')
  forEachMatch(new RegExp(`\\bnext (${weekdayNames})\\b`, 'gi'), lower, (match) => {
    add(match, weekdayInWeek(recordedAt, weekdayIndex(match[1]), 1))
  })
  forEachMatch(new RegExp(`\\b(?:this(?: coming)? |coming )?(${weekdayNames})\\b`, 'gi'), lower, (match) => {
    if (lower.slice(Math.max(0, match.index - 5), match.index).endsWith('next ')) return
    add(match, upcomingWeekday(recordedAt, weekdayIndex(match[1])))
  })

  forEachMatch(/\bin (\d+|a|one|two|three|four|five|six|seven) days?\b/gi, lower, (match) => {
    add(match, addDays(recordedAt, parseCount(match[1])))
  })
  forEachMatch(/\bin (\d+|a|one|two|three|four) weeks?\b/gi, lower, (match) => {
    add(match, addDays(recordedAt, parseCount(match[1]) * 7))
  })

  const monthNames = Object.keys(MONTHS).join('|')
  forEachMatch(
    new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'gi'),
    lower,
    (match) => {
      const month = MONTHS[match[1].toLowerCase()]
      const day = Number(match[2])
      let year = match[3] ? Number(match[3]) : recordedAt.getFullYear()
      let date = makeDate(year, month, day)
      if (!match[3] && date && date.getTime() < startOfDay(recordedAt).getTime()) {
        year += 1
        date = makeDate(year, month, day)
      }
      if (date) add(match, date)
    }
  )

  forEachMatch(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g, lower, (match) => {
    const month = Number(match[1]) - 1
    const day = Number(match[2])
    let year = match[3] ? Number(match[3]) : recordedAt.getFullYear()
    if (year < 100) year += 2000
    let date = makeDate(year, month, day)
    if (!match[3] && date && date.getTime() < startOfDay(recordedAt).getTime()) {
      date = makeDate(year + 1, month, day)
    }
    if (date) add(match, date)
  })

  if (!hits.length) return null
  // Prefer longer phrases ("next Friday" over "Friday"), then the first one spoken.
  return hits.sort((a, b) => b.length - a.length || a.index - b.index)[0]
}

export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  return Boolean(makeDate(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

function makeDate(year: number, month: number, day: number): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null
  const date = new Date(year, month, day)
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null
}

function first(re: RegExp, text: string): RegExpExecArray | null {
  return new RegExp(re.source, re.flags.replace('g', '')).exec(text)
}

function forEachMatch(re: RegExp, text: string, visit: (match: RegExpExecArray) => void): void {
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) visit(match)
}

function weekdayIndex(raw: string): number {
  return WEEKDAYS.indexOf(raw.toLowerCase() as (typeof WEEKDAYS)[number])
}

function parseCount(raw: string): number {
  const words: Record<string, number> = {
    a: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7
  }
  return words[raw] ?? Number(raw)
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(from: Date, days: number): Date {
  const next = startOfDay(from)
  next.setDate(next.getDate() + days)
  return next
}

function upcomingWeekday(from: Date, weekday: number): Date {
  const next = startOfDay(from)
  const delta = (weekday - next.getDay() + 7) % 7
  next.setDate(next.getDate() + delta)
  return next
}

function weekdayInWeek(from: Date, weekday: number, weekOffset: number): Date {
  const sunday = addDays(from, -from.getDay() + weekOffset * 7)
  return addDays(sunday, weekday)
}

function toIso(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime())
}

function isNegated(text: string, index: number): boolean {
  return /\b(?:not|isn't|is not)\s*$/.test(text.slice(Math.max(0, index - 12), index))
}
