import type { Recording, RecordingSummary, Task } from './types'

export type RecordingRow = {
  id: string
  title: string
  created_at: number
  duration_ms: number
  is_bookmarked: number
  status: Recording['status']
  error_message: string | null
  task_count: number
  completed_count: number
}

export type TaskRow = {
  id: string
  recording_id: string
  description: string
  deadline_iso: string | null
  deadline_label: string | null
  completed: number
  sort_order: number
  created_at: number
  updated_at: number
}

export function rowToSummary(row: RecordingRow): RecordingSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    durationMs: row.duration_ms,
    isBookmarked: Boolean(row.is_bookmarked),
    status: row.status,
    errorMessage: row.error_message,
    taskCount: Number(row.task_count) || 0,
    completedCount: Number(row.completed_count) || 0
  }
}

export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    recordingId: row.recording_id,
    description: row.description,
    deadlineIso: row.deadline_iso,
    deadlineLabel: row.deadline_label,
    completed: Boolean(row.completed),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
