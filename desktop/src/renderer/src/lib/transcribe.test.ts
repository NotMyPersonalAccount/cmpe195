import { describe, expect, it, vi } from 'vitest'
import { transcribeRecording } from './transcribe'

const RATE = 16000

describe('transcribeRecording', () => {
  it('returns a successful full-pass transcript without retrying', async () => {
    const run = vi.fn().mockResolvedValue('Submit the assignment Friday.')

    await expect(transcribeRecording(new Float32Array(RATE), undefined, run)).resolves.toBe(
      'Submit the assignment Friday.'
    )
    expect(run).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledWith(expect.any(Float32Array), undefined, false)
  })

  it('retries an empty full pass in live-sized segments', async () => {
    const samples = new Float32Array(RATE * 22).fill(0.1)
    const run = vi
      .fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('Submit the assignment')
      .mockResolvedValueOnce('by Friday.')
      .mockResolvedValueOnce('')

    await expect(transcribeRecording(samples, undefined, run)).resolves.toBe(
      'Submit the assignment by Friday.'
    )
    expect(run).toHaveBeenCalledTimes(4)
    expect(run.mock.calls.slice(1).every((call) => call[2] === true)).toBe(true)
  })

  it('returns an empty string when neither pass hears speech', async () => {
    const run = vi.fn().mockResolvedValue('')

    await expect(transcribeRecording(new Float32Array(RATE), undefined, run)).resolves.toBe('')
    expect(run).toHaveBeenCalledOnce()
  })
})
