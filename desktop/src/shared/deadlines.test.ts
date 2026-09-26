import { describe, expect, it } from 'vitest'
import { isIsoDate, parseDeadline } from './deadlines'

const monday = new Date(2026, 8, 21, 13, 44)

describe('parseDeadline', () => {
  it.each([
    ['tonight', '2026-09-21'],
    ['tomorrow', '2026-09-22'],
    ['day after tomorrow', '2026-09-23'],
    ['next next day', '2026-09-23'],
    ['two days from now', '2026-09-23'],
    ['Friday', '2026-09-25'],
    ['next Monday', '2026-09-28'],
    ['this week', '2026-09-25'],
    ['next week', '2026-10-02'],
    ['this weekend', '2026-09-26'],
    ['next weekend', '2026-10-03'],
    ['in 3 days', '2026-09-24'],
    ['in two weeks', '2026-10-05'],
    ['September 30', '2026-09-30'],
    ['1/7/27', '2027-01-07']
  ])('normalizes %s', (phrase, expected) => {
    expect(parseDeadline(`Submit the assignment ${phrase}`, monday)?.iso).toBe(expected)
  })

  it('rolls an unqualified past month/day into next year', () => {
    expect(parseDeadline('Submit by January 5', monday)?.iso).toBe('2027-01-05')
  })

  it('rejects impossible numeric dates', () => {
    expect(parseDeadline('Submit by 2/31/2027', monday)).toBeNull()
  })

  it('ignores a negated date and uses its correction', () => {
    expect(parseDeadline('Actually Friday, not tomorrow', monday)?.iso).toBe('2026-09-25')
  })
})

describe('isIsoDate', () => {
  it('accepts real ISO dates and rejects impossible ones', () => {
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(isIsoDate('2027-02-29')).toBe(false)
    expect(isIsoDate('09/21/2026')).toBe(false)
  })
})
