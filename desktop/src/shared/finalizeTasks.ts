import { buildTasks } from './buildTasks'
import { extractTasks } from './extractTasks'
import type { Task } from './types'

/**
 * Builds saved tasks from the completed transcript without dropping items the
 * student already saw in the live preview. The final extraction wins when it
 * describes the same task more precisely; otherwise both items are retained.
 */
export function finalizeTasks(
  transcript: string,
  recordingId: string,
  recordedAt: Date,
  liveTasks: Task[] = []
): Task[] {
  const finalTasks = buildTasks(extractTasks(transcript, recordedAt), recordingId, liveTasks)
  const merged = liveTasks.map((task) => ({ ...task, recordingId }))

  for (const finalTask of finalTasks) {
    const existingIndex = merged.findIndex((task) => sameTask(task.description, finalTask.description))
    if (existingIndex < 0) {
      merged.push(finalTask)
      continue
    }

    const existing = merged[existingIndex]
    merged[existingIndex] = {
      ...finalTask,
      id: existing.id,
      completed: existing.completed,
      createdAt: existing.createdAt
    }
  }

  return merged.map((task, index) => ({ ...task, recordingId, sortOrder: index }))
}

function sameTask(left: string, right: string): boolean {
  const leftTokens = tokens(left)
  const rightTokens = tokens(right)
  if (leftTokens.join(' ') === rightTokens.join(' ')) return true

  const leftSet = new Set(leftTokens)
  const rightSet = new Set(rightTokens)
  const intersection = leftTokens.filter((token) => rightSet.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  const subset =
    (leftTokens.length >= 3 && leftTokens.every((token) => rightSet.has(token))) ||
    (rightTokens.length >= 3 && rightTokens.every((token) => leftSet.has(token)))
  return subset || (union > 0 && intersection / union >= 0.8)
}

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
}
