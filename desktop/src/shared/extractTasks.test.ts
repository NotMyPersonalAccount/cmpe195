import { describe, expect, it } from 'vitest'
import { extractTasks } from './extractTasks'

const tuesday = new Date(2026, 8, 15, 10, 53, 0)

describe('extractTasks', () => {
  it('extracts the PRD examples with deadlines', () => {
    const transcript = [
      'Submit the assignment by Friday.',
      'Read Chapter 4.',
      'Study for the exam next week.',
      'Meet with the professor tomorrow.'
    ].join(' ')

    const tasks = extractTasks(transcript, tuesday)
    const descriptions = tasks.map((task) => task.description)

    expect(descriptions).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/submit the assignment/i),
        expect.stringMatching(/read chapter 4/i),
        expect.stringMatching(/study for the exam/i),
        expect.stringMatching(/meet with the professor/i)
      ])
    )

    const friday = tasks.find((task) => /submit/i.test(task.description))
    const exam = tasks.find((task) => /exam/i.test(task.description))
    const meet = tasks.find((task) => /professor/i.test(task.description))

    expect(friday?.deadlineIso).toBe('2026-09-18')
    expect(exam?.deadlineLabel?.toLowerCase()).toContain('next week')
    expect(meet?.deadlineIso).toBe('2026-09-16')
  })

  it('ignores lecture filler and questions', () => {
    const transcript =
      'Today we are going to talk about graphs. Any questions? Okay so please submit the assignment by Friday.'
    const tasks = extractTasks(transcript, tuesday)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].description).toMatch(/submit the assignment/i)
  })

  it('pulls numbered homework lists', () => {
    const transcript = [
      'Your homework is:',
      '1. Read chapter 4',
      '2. Finish the lab writeup',
      '3. Upload the project by September 22'
    ].join('\n')

    const tasks = extractTasks(transcript, tuesday)
    expect(tasks.length).toBeGreaterThanOrEqual(3)
    expect(tasks.some((task) => /upload the project/i.test(task.description))).toBe(true)
    const upload = tasks.find((task) => /upload the project/i.test(task.description))
    expect(upload?.deadlineIso).toBe('2026-09-22')
  })
})
