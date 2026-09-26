import { finalizeTasks } from '@shared/finalizeTasks'
import type { Task } from '@shared/types'

/** Rebuilds the read-only task preview whenever the live transcript grows. */
export function deriveLiveTasks(
  transcript: string,
  recordingStartedAt: number,
  previous: Task[] = []
): Task[] {
  if (!transcript.trim()) return []
  return finalizeTasks(
    transcript,
    'live-recording',
    new Date(recordingStartedAt),
    previous
  )
}
