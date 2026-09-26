import { describe, expect, it } from 'vitest'
import { deriveLiveTasks } from './liveTasks'

describe('deriveLiveTasks', () => {
  it('adds new action items while keeping earlier live items stable', () => {
    const startedAt = new Date('2026-09-25T12:00:00-07:00').getTime()
    const first = deriveLiveTasks('Please submit the homework by Friday.', startedAt)
    const next = deriveLiveTasks(
      'Please submit the homework by Friday. Read chapter four before Tuesday.',
      startedAt,
      first
    )

    expect(first).toHaveLength(1)
    expect(next.map((task) => task.description)).toEqual([
      'Submit the homework by Friday',
      'Read chapter four before Tuesday'
    ])
    expect(next[0].id).toBe(first[0].id)
    expect(next[0].deadlineIso).toBe('2026-09-25')
    expect(next[1].deadlineIso).toBe('2026-09-29')
  })
})
