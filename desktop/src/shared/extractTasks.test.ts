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

  it('does not turn a garbled exam date into an action item', () => {
    const tasks = extractTasks(
      'Tuesday exam (sighs) Thursday exam. Exam Tuesday exam on Tuesday [inaudible].',
      tuesday
    )
    expect(tasks).toEqual([])
  })

  it('turns a clearly scheduled assessment into an actionable task', () => {
    const tasks = extractTasks('Hello, hello, exam on Friday. (mumbling)', tuesday)

    expect(tasks).toEqual([
      {
        description: 'Study for the exam by Friday',
        deadlineIso: '2026-09-18',
        deadlineLabel: 'friday'
      }
    ])
  })

  it('keeps deadline statements when the due language is explicit', () => {
    const tasks = extractTasks('The assignment is due Friday.', tuesday)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].deadlineIso).toBe('2026-09-18')
  })

  it('separates inline Whisper bullets instead of creating one giant task', () => {
    const transcript =
      '- Peanuts at the time. - Thank you. - Thanks, Sam. - Thanks, Sam. Read chapter four before class. The quiz is Thursday. Meet with the professor tomorrow.'
    const tasks = extractTasks(transcript, tuesday)
    expect(tasks.map((task) => task.description)).toEqual([
      'Read chapter four before class',
      'Study for the quiz by Thursday',
      'Meet with the professor tomorrow'
    ])
  })

  it('recovers a sentence boundary lost between live tasks', () => {
    const transcript =
      'The exam is Tuesday. Please submit the homework by Friday to read chapter four before class. The quiz is Thursday. Meet with the professor tomorrow.'
    const tasks = extractTasks(transcript, tuesday)

    expect(tasks.map((task) => task.description)).toEqual([
      'Study for the exam by Tuesday',
      'Submit the homework by Friday',
      'Read chapter four before class',
      'Study for the quiz by Thursday',
      'Meet with the professor tomorrow'
    ])
  })

  it('does not merge deadline context into a following action', () => {
    const tasks = extractTasks(
      'Re chapter four before class. The quizzes Thursday meet with the professor tomorrow.',
      tuesday
    )

    expect(tasks.map((task) => task.description)).toEqual([
      'Meet with the professor tomorrow'
    ])
  })

  it('strips the lead-in so the task reads like a to-do', () => {
    const transcript = [
      'Before I forget, please submit the assignment by Friday.',
      'I also want you to read chapter 4.',
      'One more thing: upload the project proposal.'
    ].join(' ')

    const descriptions = extractTasks(transcript, tuesday).map((task) => task.description)
    expect(descriptions).toContain('Submit the assignment by Friday')
    expect(descriptions).toContain('Read chapter 4')
    expect(descriptions).toContain('Upload the project proposal')
  })

  it('reads the weekend as the coming Saturday', () => {
    const [task] = extractTasks('Read chapter 4 over the weekend.', tuesday)
    expect(task.deadlineIso).toBe('2026-09-19')
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

  it('deduplicates repeated and nearly identical reminders', () => {
    const tasks = extractTasks(
      'Please submit the assignment by Friday. Remember to submit the assignment by Friday!',
      tuesday
    )
    expect(tasks).toHaveLength(1)
  })

  it('does not confuse chapter 1 with chapter 10', () => {
    const tasks = extractTasks('Read chapter 1. Read chapter 10.', tuesday)
    expect(tasks.map((task) => task.description)).toEqual(['Read chapter 1', 'Read chapter 10'])
  })

  it('limits automatic extraction to 25 tasks', () => {
    const transcript = Array.from({ length: 40 }, (_, index) => `Read chapter ${index + 1}.`).join(' ')
    expect(extractTasks(transcript, tuesday)).toHaveLength(25)
  })
})
