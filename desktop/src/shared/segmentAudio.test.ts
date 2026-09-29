import { describe, expect, it } from 'vitest'
import { findCutPoint, isProbablySilent, splitRecordingAudio } from './segmentAudio'

const RATE = 16000

function build(spans: Array<{ seconds: number; amplitude: number }>): Float32Array {
  const total = spans.reduce((sum, span) => sum + Math.floor(span.seconds * RATE), 0)
  const samples = new Float32Array(total)
  let offset = 0
  for (const span of spans) {
    const length = Math.floor(span.seconds * RATE)
    for (let i = 0; i < length; i++) {
      // Alternating sign keeps RMS equal to the amplitude without needing sin().
      samples[offset + i] = i % 2 === 0 ? span.amplitude : -span.amplitude
    }
    offset += length
  }
  return samples
}

describe('findCutPoint', () => {
  it('keeps buffering until the minimum length', () => {
    expect(findCutPoint(build([{ seconds: 3, amplitude: 0.2 }]), RATE)).toBe(-1)
  })

  it('cuts on a pause once past the minimum', () => {
    const samples = build([
      { seconds: 9, amplitude: 0.3 },
      { seconds: 0.5, amplitude: 0 },
      { seconds: 2, amplitude: 0.3 }
    ])
    const cut = findCutPoint(samples, RATE)
    expect(cut).toBeGreaterThan(9 * RATE - RATE)
    expect(cut).toBeLessThan(9.6 * RATE)
  })

  it('waits through continuous speech rather than slicing a word', () => {
    expect(findCutPoint(build([{ seconds: 12, amplitude: 0.3 }]), RATE)).toBe(-1)
  })

  it('forces a cut when the chunk gets too long to wait', () => {
    const cut = findCutPoint(build([{ seconds: 25, amplitude: 0.3 }]), RATE)
    expect(cut).toBeGreaterThan(0)
    expect(cut).toBeLessThanOrEqual(20 * RATE)
  })

  it('honours custom bounds', () => {
    const samples = build([
      { seconds: 2, amplitude: 0.3 },
      { seconds: 0.5, amplitude: 0 },
      { seconds: 1, amplitude: 0.3 }
    ])
    expect(findCutPoint(samples, RATE, { minSeconds: 2, maxSeconds: 5 })).toBeGreaterThan(0)
  })
})

describe('isProbablySilent', () => {
  it('detects a silent chunk so we do not transcribe dead air', () => {
    expect(isProbablySilent(build([{ seconds: 2, amplitude: 0 }]))).toBe(true)
  })

  it('treats speech-level audio as not silent', () => {
    expect(isProbablySilent(build([{ seconds: 2, amplitude: 0.2 }]))).toBe(false)
  })
})

describe('splitRecordingAudio', () => {
  it('replays a saved recording through pause-aware live-sized segments', () => {
    const samples = build([
      { seconds: 9, amplitude: 0.3 },
      { seconds: 0.5, amplitude: 0 },
      { seconds: 9, amplitude: 0.3 },
      { seconds: 0.5, amplitude: 0 },
      { seconds: 3, amplitude: 0.3 }
    ])

    const segments = splitRecordingAudio(samples, RATE)

    expect(segments).toHaveLength(3)
    expect(segments.reduce((sum, segment) => sum + segment.length, 0)).toBe(samples.length)
  })

  it('drops a completely silent recording', () => {
    expect(splitRecordingAudio(build([{ seconds: 10, amplitude: 0 }]), RATE)).toEqual([])
  })
})
