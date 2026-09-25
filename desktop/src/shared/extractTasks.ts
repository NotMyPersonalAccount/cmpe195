import { parseDeadline } from './deadlines.ts'

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

export function extractTasks(transcript: string, recordedAt: Date = new Date()): ExtractedTask[] {
  const found: ExtractedTask[] = []
  for (const unit of splitUnits(transcript)) {
    const cleaned = cleanDescription(unit)
    if (cleaned.split(/\s+/).length < 2) continue
    const deadline = parseDeadline(cleaned, recordedAt)
    if (scoreUnit(cleaned, Boolean(deadline)) < 3) continue
    found.push({
      description: capitalize(cleaned),
      deadlineIso: deadline?.iso ?? null,
      deadlineLabel: deadline?.label ?? null
    })
  }
  return dedupe(found).slice(0, 25)
}

function splitUnits(transcript: string): string[] {
  const units: string[] = []
  for (const line of transcript.replace(/\r/g, '').split(/\n+/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^(\d+[).:]|[-*•])\s+/.test(trimmed)) {
      units.push(trimmed.replace(/^(\d+[).:]|[-*•])\s+/, ''))
      continue
    }
    for (const sentence of trimmed.split(/(?<=[.!?])\s+(?=[A-Z“"'])/)) {
      units.push(...sentence.split(/\s+;\s+|\s+—\s+/))
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
  let out = text.replace(/\s+/g, ' ').trim().replace(/^[.!,;:\s]+|[.!,;:\s]+$/g, '')
  let previous = ''
  while (previous !== out) {
    previous = out
    out = out
      .replace(/^(ok(ay)?|so|um+|uh+|alright|all right|now|anyway|also|and|well),?\s+/i, '')
      .replace(/^(hey|everyone|class|folks|guys),?\s+/i, '')
      .replace(/^(remember|please),?\s+/i, '')
      .replace(/^(before i forget|quick reminder|just a reminder|as a reminder|a reminder|reminder|one more thing|last thing|first of all|finally)[,.:]?\s+/i, '')
      .replace(/^(you (need to|have to|should|must|will need to)|you're going to need to|you are going to need to)\s+/i, '')
      .replace(/^(i|we) (also |really |just )?(want|need) (you|everyone)( all)? to\s+/i, '')
      .replace(/^(make sure( you| to)?|don't forget to|do not forget to|remember to|be sure to)\s+/i, '')
      .replace(/^(the homework is to|your homework is to|the assignment is to)\s+/i, '')
  }
  return out.replace(/\s+/g, ' ').trim()
}

function dedupe(tasks: ExtractedTask[]): ExtractedTask[] {
  const kept: ExtractedTask[] = []
  for (const task of tasks) {
    const key = normalize(task.description)
    const duplicate = kept.find((item) => {
      const other = normalize(item.description)
      return other === key || other.includes(key) || key.includes(other) || similarity(other, key) >= 0.82
    })
    if (!duplicate) kept.push(task)
    else if (task.description.length > duplicate.description.length) kept[kept.indexOf(duplicate)] = task
  }
  return kept
}

function similarity(a: string, b: string): number {
  const left = new Set(a.split(' ').filter(Boolean))
  const right = new Set(b.split(' ').filter(Boolean))
  const intersection = [...left].filter((token) => right.has(token)).length
  const union = new Set([...left, ...right]).size
  return union ? intersection / union : 0
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}
