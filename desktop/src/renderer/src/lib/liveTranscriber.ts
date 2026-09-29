import { findCutPoint, isProbablySilent, measureAudio } from '@shared/segmentAudio'
import { transcribe, warmUpModel } from './transcribe'
import { logDiagnostic } from './diagnostics'

const SAMPLE_RATE = 16000

export type LiveState = {
  text: string
  queued: number
  note: string | null
}

/**
 * Turns a stream of microphone samples into a transcript that grows while the
 * lecture is still running. Segments are cut at pauses, transcribed one at a
 * time, and appended in order.
 */
export class LiveTranscriber {
  private buffer: Float32Array = new Float32Array(0)
  private segments: string[] = []
  private queued = 0
  private chain: Promise<void> = Promise.resolve()
  private cancelled = false
  private failed = false
  private note: string | null = 'Preparing the local speech model…'

  onUpdate?: (state: LiveState) => void

  prepare(): void {
    this.emit()
    void warmUpModel((message) => {
      this.note = message
      this.emit()
    })
      .then(() => {
        this.note = null
        this.emit()
      })
      .catch((error) => {
        // The first actual segment gets another attempt. Recording continues
        // regardless, and the saved audio can always be transcribed on stop.
        this.note =
          error instanceof Error
            ? `Live transcript is waiting to retry: ${error.message}`
            : 'Live transcript is waiting to retry.'
        this.emit()
      })
  }

  push(chunk: Float32Array): void {
    if (this.cancelled) return

    this.buffer = concat(this.buffer, chunk)

    let cut = findCutPoint(this.buffer, SAMPLE_RATE)
    while (cut > 0) {
      this.enqueue(this.buffer.slice(0, cut))
      this.buffer = this.buffer.slice(cut)
      cut = findCutPoint(this.buffer, SAMPLE_RATE)
    }
  }

  /** Flushes the tail and waits for every queued segment to come back. */
  async finish(): Promise<string> {
    if (this.buffer.length > 0) {
      this.enqueue(this.buffer)
      this.buffer = new Float32Array(0)
    }
    await this.chain
    if (this.failed) throw new Error(this.note ?? 'Live transcription failed')
    logDiagnostic('live.finished', {
      segmentCount: this.segments.length,
      nonEmptySegments: this.segments.filter((segment) => segment.trim()).length,
      transcriptChars: this.text.length
    })
    return this.text
  }

  cancel(): void {
    this.cancelled = true
    this.buffer = new Float32Array(0)
    this.segments = []
    this.queued = 0
  }

  get text(): string {
    return this.segments.join(' ').replace(/\s+/g, ' ').trim()
  }

  get state(): LiveState {
    return { text: this.text, queued: this.queued, note: this.note }
  }

  private enqueue(segment: Float32Array): void {
    if (this.cancelled) return
    // Dead air still costs a model run and often comes back as a hallucinated
    // phrase, so skip it rather than put it in the transcript.
    const metrics = measureAudio(segment, SAMPLE_RATE)
    if (isProbablySilent(segment)) {
      logDiagnostic('live.segment_skipped', { reason: 'silent', ...metrics })
      return
    }

    const index = this.segments.length
    this.segments.push('')
    this.queued += 1
    logDiagnostic('live.segment_queued', {
      segmentIndex: index,
      queued: this.queued,
      ...metrics
    })
    this.emit()

    this.chain = this.chain.then(async () => {
      if (this.cancelled) return
      try {
        const text = await transcribe(
          segment,
          (message) => {
            this.note = message
            this.emit()
          },
          true
        )
        this.segments[index] = text.trim()
        this.note = null
        logDiagnostic('live.segment_result', {
          segmentIndex: index,
          transcriptChars: this.segments[index].length,
          transcriptWords: wordCount(this.segments[index]),
          empty: this.segments[index].length === 0
        })
      } catch (error) {
        this.segments[index] = ''
        this.failed = true
        this.note =
          error instanceof Error
            ? `Live transcript paused: ${error.message}`
            : 'Live transcript paused.'
      } finally {
        this.queued = Math.max(0, this.queued - 1)
        this.emit()
      }
    })
  }

  private emit(): void {
    if (!this.cancelled) this.onUpdate?.(this.state)
  }
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function concat(left: Float32Array, right: Float32Array): Float32Array {
  if (left.length === 0) return right.slice()
  const out = new Float32Array(left.length + right.length)
  out.set(left, 0)
  out.set(right, left.length)
  return out
}
