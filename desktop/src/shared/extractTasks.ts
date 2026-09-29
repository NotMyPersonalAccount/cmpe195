import { parseDeadline, type Deadline } from './deadlines.ts'
import { cleanTranscriptText } from './cleanTranscript.ts'

const TASK_VERBS =
  /\b(submit|turn in|hand in|upload|read|study|review|complete|finish|write|prepare|practice|watch|attend|meet|email|send|bring|print|register|sign up|start|work on|revise|edit|solve|implement|code|debug|memorize|outline|draft|rewrite|annotate|summarize|present|rehearse|schedule)\b/i
const TASK_NOUNS =
  /\b(homework|assignment|quiz|exam|midterm|final|project|lab|paper|essay|report|problem set|pset|worksheet|reading|chapter|deadline|due date|presentation|problem|exercise|portfolio)\b/i
const NEED_TO =
  /\b(need to|have to|should|must|make sure( you| to)?|don't forget to|do not forget to|remember to|be sure to|i want you( all)? to|you will need to|you're expected to|you are expected to|please)\b/i
const LECTURE_FILLER =
  /\b(today (we|i)|we('re| are) going to (talk|discuss|cover|look|go over)|this lecture|let's talk about|i want to talk about|as i (said|mentioned)|last (time|class|lecture))\b/i
const QUESTION = /^\s*(who|what|when|where|why|how|does|do|did|is|are|can|could|would|will)\b.*\?$/i
const CORRECTION_CUE =
  /\b(?:actually|correction|i mean|scratch that|make that|change that to|move that to|rather|instead|it should be|oh,?\s+wait|wait,?\s+(?:i|that|it)|no,?|sorry,?|not\s+(?:today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i
const SCHEDULED_NOUN =
  '(quiz|exam|test|midterm|final|presentation|assignment|homework|project|paper|essay|report|lab|problem set|worksheet)'
const SPOKEN_DATE =
  '(today|tonight|tomorrow|day after tomorrow|next next day|next week|this week|next weekend|this weekend|the weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|(?:january|february|march|april|may|june|july|august|september|october|november|december)\\s+\\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?|in\\s+(?:\\d+|a|one|two|three|four|five|six|seven)\\s+(?:days?|weeks?))'

export type ExtractedTask = {
  description: string
  deadlineIso: string | null
  deadlineLabel: string | null
}

export function extractTasks(transcript: string, recordedAt: Date = new Date()): ExtractedTask[] {
  const cleanedTranscript = cleanTranscriptText(transcript)
  const found: ExtractedTask[] = []
  let correctionWindow = 0
  for (const unit of splitUnits(cleanedTranscript)) {
    const cleaned = cleanDescription(unit)
    if (cleaned.split(/\s+/).length < 2) continue
    const scheduled = extractScheduledTasks(cleaned, recordedAt)
    if (scheduled.length > 0) {
      found.push(...scheduled)
      correctionWindow = 0
      continue
    }
    const deadline = parseDeadline(cleaned, recordedAt)
    const hasCorrectionCue = CORRECTION_CUE.test(cleaned)
    const hasTaskVerb = TASK_VERBS.test(cleaned)

    if (hasCorrectionCue && found.length > 0) correctionWindow = 4

    // Apply correction-only phrases immediately to the task that preceded
    // them. Keeping this sequential prevents a later assignment from receiving
    // an earlier correction.
    if (found.length > 0 && correctionWindow > 0 && !hasTaskVerb) {
      const previousIndex = found.length - 1
      if (deadline) {
        found[previousIndex] = applyDeadlineCorrection(found[previousIndex], deadline)
        correctionWindow = 0
      } else if (negatesCurrentDeadline(cleaned, found[previousIndex].deadlineLabel)) {
        found[previousIndex] = removeDeadline(found[previousIndex])
        correctionWindow = 0
      } else {
        correctionWindow -= 1
      }
      continue
    }

    if (scoreUnit(cleaned, Boolean(deadline)) < 3) continue
    found.push({
      description: capitalize(cleaned),
      deadlineIso: deadline?.iso ?? null,
      deadlineLabel: deadline?.label ?? null
    })
    correctionWindow = 0
  }
  return dedupe(found).slice(0, 25)
}

function applyDeadlineCorrection(task: ExtractedTask, deadline: Deadline): ExtractedTask {
  const spokenLabel = deadline.label
  const displayLabel = /^(?:day after tomorrow|next next day|(?:2|two) days (?:from now|later))$/i.test(spokenLabel)
    ? 'in two days'
    : capitalizeDateLabel(spokenLabel)
  let description = task.description

  if (task.deadlineLabel) {
    description = description.replace(
      new RegExp(`\\b${escapeRegExp(task.deadlineLabel)}\\b`, 'i'),
      displayLabel
    )
  } else if (/\b(?:due|by)\s*$/i.test(description)) {
    description = `${description} ${displayLabel}`
  } else {
    description = `${description} by ${displayLabel}`
  }

  return {
    description,
    deadlineIso: deadline.iso,
    deadlineLabel: spokenLabel
  }
}

function negatesCurrentDeadline(text: string, currentLabel: string | null): boolean {
  if (!currentLabel) return false
  return new RegExp(`\\bnot\\s+${escapeRegExp(currentLabel)}\\b`, 'i').test(text)
}

function removeDeadline(task: ExtractedTask): ExtractedTask {
  if (!task.deadlineLabel) return task
  const description = task.description
    .replace(
      new RegExp(`\\s+\\b(?:due\\s+|by\\s+)?${escapeRegExp(task.deadlineLabel)}\\b`, 'i'),
      ''
    )
    .replace(/\s+/g, ' ')
    .trim()
  return { description, deadlineIso: null, deadlineLabel: null }
}

function capitalizeDateLabel(label: string): string {
  return /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(label)
    ? capitalize(label)
    : label
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractScheduledTasks(text: string, recordedAt: Date): ExtractedTask[] {
  const pattern = new RegExp(
    `(^|\\b(and|plus|also|in)\\s+)(?:(?:i|we)\\s+(?:have|got)\\s+|there(?:'s| is)\\s+)?(?:(?:the|an?|your|another)\\s+)?${SCHEDULED_NOUN}\\s+(?:is\\s+(?:on\\s+)?|scheduled\\s+(?:on\\s+)?|on\\s+|by\\s+)${SPOKEN_DATE}`,
    'gi'
  )
  const tasks: ExtractedTask[] = []

  for (const match of text.matchAll(pattern)) {
    const separator = match[2]?.toLowerCase()
    // Tiny Whisper occasionally hears "and a midterm" as "in a midterm".
    // Only accept that repair after a clear scheduled item in the same unit,
    // so ordinary phrases such as "worked in a project on Friday" stay notes.
    if (separator === 'in' && tasks.length === 0) continue

    const noun = match[3].toLowerCase()
    const dateText = match[4]
    const deadline = parseDeadline(dateText, recordedAt)
    if (!deadline) continue

    const action =
      noun === 'presentation'
        ? 'Prepare for'
        : /^(?:quiz|exam|test|midterm|final)$/.test(noun)
          ? 'Study for'
          : 'Complete'
    tasks.push({
      description: `${action} the ${noun} by ${capitalizeDateLabel(dateText)}`,
      deadlineIso: deadline.iso,
      deadlineLabel: deadline.label
    })
  }

  return tasks
}

function splitUnits(transcript: string): string[] {
  const units: string[] = []
  for (const line of transcript.replace(/\r/g, '').split(/\n+/)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Whisper often emits several spoken turns as inline bullets on one line:
    // "- Thanks. - Read chapter 4. - Submit Friday." Treat every marker as a
    // boundary instead of assuming the first dash makes the whole line one item.
    const withoutNumberMarker = trimmed.replace(/^\d+[).:]\s+/, '')
    const bulletParts = withoutNumberMarker
      .split(/(?:^|\s+)[-*•]\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
    const parts = bulletParts.length > 0 ? bulletParts : [trimmed]

    for (const part of parts) {
      for (const sentence of part.split(/(?<=[.!?])\s+(?=[A-Z“"'])/)) {
        for (const clause of sentence.split(/\s+;\s+|\s+—\s+/)) {
          units.push(...splitChainedTasks(clause))
        }
      }
    }
  }
  return units.map((unit) => unit.trim().replace(/^["'“]+|["'”]+$/g, '')).filter(Boolean)
}

function splitChainedTasks(text: string): string[] {
  const units: string[] = []
  let remaining = text
  const boundary =
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|next week|this week|the weekend|this weekend)\s+(?:to\s+)?(?=(?:submit|turn in|hand in|upload|read|study|review|complete|finish|write|prepare|practice|watch|attend|meet|email|send|bring|print|register|start|revise|edit|solve|implement|code|debug|memorize|outline|draft|annotate|summarize|present|rehearse|schedule)\b)/i

  // A live Whisper chunk can turn "by Friday. Read chapter four" into
  // "by Friday to read chapter four", or "Thursday. Meet..." into
  // "Thursday meet...". Recover either missing sentence boundary.
  while (true) {
    const match = boundary.exec(remaining)
    if (!match) break
    units.push(remaining.slice(0, match.index + match[1].length))
    remaining = remaining.slice(match.index + match[0].length)
  }
  units.push(remaining)
  return units.filter((unit) => unit.trim())
}

function scoreUnit(text: string, hasDeadline: boolean): number {
  const hasTaskVerb = TASK_VERBS.test(text)
  const hasDirective = NEED_TO.test(text)
  const hasExplicitDueLanguage = /\b(due|deadline|assigned)\b/i.test(text)

  // A noun plus a weekday is often just lecture context ("exam Tuesday"),
  // not an instruction. Require an action or explicit due-date wording before
  // creating a to-do; this is especially important for imperfect live speech.
  if (!hasTaskVerb && !hasDirective && !hasExplicitDueLanguage) return -Infinity

  let score = 0
  if (hasTaskVerb) score += 2
  if (TASK_NOUNS.test(text)) score += 2
  if (hasDirective) score += 2
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
      .replace(/^(?:hello|hi)(?:,\s*(?:hello|hi))*[,]?\s+/i, '')
      .replace(/^(ok(ay)?|so|um+|uh+|alright|all right|now|anyway|also|and|well),?\s+/i, '')
      .replace(/^oh,?\s+/i, '')
      .replace(/^(hey|everyone|class|folks|guys),?\s+/i, '')
      .replace(/^(remember|please),?\s+/i, '')
      .replace(/^(before i forget|quick reminder|just a reminder|as a reminder|a reminder|reminder|one more thing|last thing|first of all|finally)[,.:]?\s+/i, '')
      .replace(/^(you (need to|have to|should|must|will need to)|you're going to need to|you are going to need to)\s+/i, '')
      .replace(/^(i|we) (also |really |just )?(want|need) (you|everyone)( all)? to\s+/i, '')
      .replace(/^(make sure( you| to)?|don't forget to|do not forget to|remember to|be sure to)\s+/i, '')
      .replace(/^(the homework is to|your homework is to|the assignment is to)\s+/i, '')
  }
  return normalizeScheduledAssessment(out.replace(/\s+/g, ' ').trim())
}

function normalizeScheduledAssessment(text: string): string {
  const match = text.match(
    /^(?:(?:the|an?|your)\s+)?(exam|quiz|test|midterm|final|presentation)\s+(?:is\s+(?:on\s+)?|on\s+)(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|next week|this week|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2})(?:[.!?])?$/i
  )
  if (!match) return text

  const assessment = match[1].toLowerCase()
  const deadline = match[2]
  const action = assessment === 'presentation' ? 'Prepare for' : 'Study for'
  return `${action} the ${assessment} by ${deadline}`
}

function dedupe(tasks: ExtractedTask[]): ExtractedTask[] {
  const kept: ExtractedTask[] = []
  for (const task of tasks) {
    const key = normalize(task.description)
    const duplicate = kept.find((item) => {
      const other = normalize(item.description)
      return other === key || tokenSubset(other, key) || tokenSubset(key, other) || similarity(other, key) >= 0.82
    })
    if (!duplicate) kept.push(task)
    else if (task.description.length > duplicate.description.length) kept[kept.indexOf(duplicate)] = task
  }
  return kept
}

function tokenSubset(shorter: string, longer: string): boolean {
  const left = shorter.split(' ').filter(Boolean)
  const right = new Set(longer.split(' ').filter(Boolean))
  return left.length >= 3 && left.length < right.size && right.size - left.length <= 2 && left.every((token) => right.has(token))
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
