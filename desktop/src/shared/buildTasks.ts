import type { ExtractedTask, Task } from './types'

/**
 * Turns extracted text into task rows. Completion survives a rebuild: an item
 * the student already checked off comes back checked if the extractor still
 * finds it, so fixing a typo in the transcript does not undo their progress.
 */
export function buildTasks(
  extracted: ExtractedTask[],
  recordingId: string,
  previous: Task[] = []
): Task[] {
  const now = Date.now()
  const alreadyDone = new Set(
    previous.filter((task) => task.completed).map((task) => normalize(task.description))
  )

  return extracted.map((item, index) => ({
    id: crypto.randomUUID(),
    recordingId,
    description: item.description,
    deadlineIso: item.deadlineIso,
    deadlineLabel: item.deadlineLabel,
    completed: alreadyDone.has(normalize(item.description)),
    sortOrder: index,
    createdAt: now,
    updatedAt: now
  }))
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
