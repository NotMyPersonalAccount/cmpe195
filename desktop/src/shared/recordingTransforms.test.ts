import { describe, expect, it } from 'vitest'
import { rowToSummary, rowToTask } from './recordingTransforms'

describe('recording data transformations', () => {
  it('maps SQLite booleans and counts into a recording summary', () => {
    expect(
      rowToSummary({
        id: 'r1',
        title: 'Algorithms',
        created_at: 10,
        duration_ms: 20,
        is_bookmarked: 1,
        status: 'ready',
        error_message: null,
        task_count: 3,
        completed_count: 2
      })
    ).toMatchObject({ isBookmarked: true, taskCount: 3, completedCount: 2 })
  })

  it('preserves task identity, order, deadlines, and timestamps', () => {
    expect(
      rowToTask({
        id: 't1',
        recording_id: 'r1',
        description: 'Read chapter 4',
        deadline_iso: '2026-09-25',
        deadline_label: 'Friday',
        completed: 1,
        sort_order: 4,
        created_at: 100,
        updated_at: 200
      })
    ).toEqual({
      id: 't1',
      recordingId: 'r1',
      description: 'Read chapter 4',
      deadlineIso: '2026-09-25',
      deadlineLabel: 'Friday',
      completed: true,
      sortOrder: 4,
      createdAt: 100,
      updatedAt: 200
    })
  })
})
