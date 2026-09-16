import { describe, expect, it } from 'vitest'
import { buildTasks } from './buildTasks'
import type { Task } from './types'

const extracted = [
  { description: 'Read chapter 4', deadlineIso: null, deadlineLabel: null },
  { description: 'Submit the assignment', deadlineIso: '2026-09-18', deadlineLabel: 'Friday' }
]

function existing(description: string, completed: boolean): Task {
  return {
    id: 'old',
    recordingId: 'rec',
    description,
    deadlineIso: null,
    deadlineLabel: null,
    completed,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1
  }
}

describe('buildTasks', () => {
  it('numbers tasks in order and carries the deadline through', () => {
    const tasks = buildTasks(extracted, 'rec')
    expect(tasks.map((task) => task.sortOrder)).toEqual([0, 1])
    expect(tasks.every((task) => task.recordingId === 'rec')).toBe(true)
    expect(tasks[1].deadlineIso).toBe('2026-09-18')
    expect(tasks.every((task) => task.completed)).toBe(false)
  })

  it('keeps a checked-off task checked when it is found again', () => {
    const tasks = buildTasks(extracted, 'rec', [existing('Read chapter 4', true)])
    expect(tasks.find((task) => task.description === 'Read chapter 4')?.completed).toBe(true)
    expect(tasks.find((task) => task.description === 'Submit the assignment')?.completed).toBe(false)
  })

  it('matches loosely so punctuation and case do not lose progress', () => {
    const tasks = buildTasks(extracted, 'rec', [existing('read chapter 4.', true)])
    expect(tasks.find((task) => task.description === 'Read chapter 4')?.completed).toBe(true)
  })

  it('does not resurrect a task the extractor no longer finds', () => {
    const tasks = buildTasks(extracted, 'rec', [existing('Email the TA', true)])
    expect(tasks).toHaveLength(2)
    expect(tasks.some((task) => task.description === 'Email the TA')).toBe(false)
  })
})
