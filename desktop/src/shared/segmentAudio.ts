export type SegmentOptions = {
  minSeconds?: number
  maxSeconds?: number
  windowSeconds?: number
  silenceRms?: number
}

export type AudioMetrics = {
  audioSeconds: number
  rms: number
  peak: number
  voicedPercent: number
}

/**
 * Picks where to cut a growing buffer of live audio into a transcribable chunk.
 *
 * Cutting on a fixed timer slices words in half, and Whisper cannot recover a
 * word it only heard the front of. So we wait for the quietest moment after a
 * minimum length, which in a lecture is the gap between sentences, and only
 * force a cut once the chunk grows long enough to hurt latency.
 *
 * Returns the sample index to cut at, or -1 to keep buffering.
 */
export function findCutPoint(
  samples: Float32Array,
  sampleRate: number,
  options: SegmentOptions = {}
): number {
  const {
    minSeconds = 5,
    maxSeconds = 15,
    windowSeconds = 0.25,
    silenceRms = 0.015
  } = options

  const minIndex = Math.floor(minSeconds * sampleRate)
  const maxIndex = Math.floor(maxSeconds * sampleRate)
  const windowSize = Math.max(1, Math.floor(windowSeconds * sampleRate))

  if (samples.length < minIndex + windowSize) return -1

  const limit = Math.min(samples.length, maxIndex)
  let quietestRms = Infinity
  let quietestCentre = -1

  for (let start = minIndex; start + windowSize <= limit; start += windowSize) {
    const rms = windowRms(samples, start, windowSize)
    if (rms < quietestRms) {
      quietestRms = rms
      quietestCentre = start + Math.floor(windowSize / 2)
    }
  }

  if (quietestCentre < 0) return -1
  if (quietestRms <= silenceRms) return quietestCentre

  // No pause to cut on. Keep waiting unless the chunk is already too long,
  // in which case take the quietest point we found rather than stall.
  return samples.length >= maxIndex ? quietestCentre : -1
}

function windowRms(samples: Float32Array, start: number, length: number): number {
  let sum = 0
  for (let i = start; i < start + length; i++) {
    sum += samples[i] * samples[i]
  }
  return Math.sqrt(sum / length)
}

export function isProbablySilent(samples: Float32Array, silenceRms = 0.008): boolean {
  if (samples.length === 0) return true
  return windowRms(samples, 0, samples.length) <= silenceRms
}

export function measureAudio(samples: Float32Array, sampleRate: number): AudioMetrics {
  if (samples.length === 0) {
    return { audioSeconds: 0, rms: 0, peak: 0, voicedPercent: 0 }
  }

  let sum = 0
  let peak = 0
  for (const sample of samples) {
    sum += sample * sample
    peak = Math.max(peak, Math.abs(sample))
  }

  const windowSize = Math.max(1, Math.floor(sampleRate * 0.1))
  let windows = 0
  let voiced = 0
  for (let offset = 0; offset < samples.length; offset += windowSize) {
    const length = Math.min(windowSize, samples.length - offset)
    if (windowRms(samples, offset, length) >= 0.008) voiced += 1
    windows += 1
  }

  return {
    audioSeconds: rounded(samples.length / sampleRate, 2),
    rms: rounded(Math.sqrt(sum / samples.length), 5),
    peak: rounded(peak, 5),
    voicedPercent: rounded((voiced / windows) * 100, 1)
  }
}

function rounded(value: number, digits: number): number {
  return Number(value.toFixed(digits))
}

/** Splits a saved recording at the same pause-aware boundaries used live. */
export function splitRecordingAudio(
  samples: Float32Array,
  sampleRate: number,
  options: SegmentOptions = {}
): Float32Array[] {
  const segments: Float32Array[] = []
  let offset = 0

  while (offset < samples.length) {
    const remaining = samples.subarray(offset)
    const cut = findCutPoint(remaining, sampleRate, options)
    const length = cut > 0 ? cut : remaining.length
    const segment = samples.slice(offset, offset + length)
    if (!isProbablySilent(segment)) segments.push(segment)
    offset += length
  }

  return segments
}
