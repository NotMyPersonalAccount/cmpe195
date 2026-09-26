import { buildTasks } from '@shared/buildTasks'
import { extractTasks } from '@shared/extractTasks'
import type { Task } from '@shared/types'

/** Rebuilds the read-only task preview whenever the live transcript grows. */
export function deriveLiveTasks(
  transcript: string,
  recordingStartedAt: number,
  previous: Task[] = []
): Task[] {
  if (!transcript.trim()) return []
  return buildTasks(
    extractTasks(transcript, new Date(recordingStartedAt)),
    'live-recording',
    previous
  )
}
