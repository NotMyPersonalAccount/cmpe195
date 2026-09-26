import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  transcribe: vi.fn(async () => 'Please submit the homework by Friday.'),
  warmUpModel: vi.fn(async () => undefined)
}))

vi.mock('./transcribe', () => mocks)

import { LiveTranscriber, type LiveState } from './liveTranscriber'

const RATE = 16000

describe('LiveTranscriber', () => {
  beforeEach(() => {
    mocks.transcribe.mockClear()
    mocks.warmUpModel.mockClear()
  })

  it('publishes text before the recording is stopped', async () => {
    const live = new LiveTranscriber()
    let latest: LiveState = live.state
    live.onUpdate = (state) => {
      latest = state
    }
    live.prepare()

    // Nine seconds of speech followed by a pause is enough to create a live
    // segment. Feed worklet-sized buffers exactly as the microphone path does.
    const samples = new Float32Array(Math.floor(9.5 * RATE))
    for (let index = 0; index < 9 * RATE; index++) {
      samples[index] = index % 2 === 0 ? 0.1 : -0.1
    }
    for (let offset = 0; offset < samples.length; offset += 4096) {
      live.push(samples.slice(offset, Math.min(offset + 4096, samples.length)))
    }

    await vi.waitFor(() => expect(mocks.transcribe).toHaveBeenCalledTimes(1))
    await vi.waitFor(() =>
      expect(latest.text).toBe('Please submit the homework by Friday.')
    )
    expect(latest.queued).toBe(0)
    expect(mocks.warmUpModel).toHaveBeenCalledTimes(1)
  })
})
