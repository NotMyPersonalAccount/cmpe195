export type SegmentOptions = {
  minSeconds?: number
  maxSeconds?: number
  windowSeconds?: number
  silenceRms?: number
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
    minSeconds = 8,
    maxSeconds = 20,
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
