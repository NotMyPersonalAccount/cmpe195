import { describe, expect, it } from 'vitest'
import type { Task } from './types'
import { finalizeTasks } from './finalizeTasks'

const recordedAt = new Date('2026-09-25T12:00:00-07:00')

function liveTask(description: string): Task {
  return {
    id: 'live-task',
    recordingId: 'live-recording',
    description,
    deadlineIso: '2026-09-25',
    deadlineLabel: 'friday',
    completed: false,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1
  }
}

describe('finalizeTasks', () => {
  it('preserves a live task when the final tail produces no tasks', () => {
    const tasks = finalizeTasks(
      'Exam on Friday. unrelated unfinished fragment',
      'saved-recording',
      recordedAt,
      [liveTask('Study for the exam by Friday')]
    )

    expect(tasks).toHaveLength(1)
    expect(tasks[0].description).toBe('Study for the exam by Friday')
    expect(tasks[0].recordingId).toBe('saved-recording')
  })

  it('merges a refined final task instead of duplicating its live preview', () => {
    const tasks = finalizeTasks(
      'Please submit the homework by Friday.',
      'saved-recording',
      recordedAt,
      [liveTask('Submit the homework')]
    )

    expect(tasks).toHaveLength(1)
    expect(tasks[0].description).toBe('Submit the homework by Friday')
    expect(tasks[0].id).toBe('live-task')
  })
})
