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
  const previousByDescription = new Map(
    previous.map((task) => [normalize(task.description), task])
  )

  return extracted.map((item, index) => {
    const existing = previousByDescription.get(normalize(item.description))
    const unchanged =
      existing?.deadlineIso === item.deadlineIso &&
      existing?.deadlineLabel === item.deadlineLabel &&
      existing?.sortOrder === index

    return {
      id: existing?.id ?? crypto.randomUUID(),
      recordingId,
      description: item.description,
      deadlineIso: item.deadlineIso,
      deadlineLabel: item.deadlineLabel,
      completed: existing?.completed ?? false,
      sortOrder: index,
      createdAt: existing?.createdAt ?? now,
      updatedAt: unchanged && existing ? existing.updatedAt : now
    }
  })
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
