import workletUrl from '../workers/pcm-worklet.js?url'
import { resampleChunk } from './audio'

const TARGET_RATE = 16000

function pickMime(): string | undefined {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return types.find((type) => MediaRecorder.isTypeSupported(type))
}

export class MicRecorder {
  private media?: MediaStream
  private recorder?: MediaRecorder
  private chunks: Blob[] = []
  private startedAt = 0
  private timer?: number
  private audioContext?: AudioContext
  private tap?: AudioWorkletNode

  onTick?: (elapsedMs: number) => void
  /** Called with 16 kHz mono samples while recording, for live transcription. */
  onPcm?: (samples: Float32Array) => void

  async start(): Promise<void> {
    this.chunks = []
    this.media = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    })

    const mime = pickMime()
    this.recorder = mime
      ? new MediaRecorder(this.media, { mimeType: mime })
      : new MediaRecorder(this.media)

    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) this.chunks.push(event.data)
    })

    if (this.onPcm) {
      // Failing to tap audio must not cost the student their recording, so the
      // live path is best-effort and MediaRecorder carries on regardless.
      try {
        await this.startTap()
      } catch {
        this.onPcm = undefined
      }
    }

    this.startedAt = Date.now()
    this.recorder.start(1000)
    this.timer = window.setInterval(() => {
      this.onTick?.(Date.now() - this.startedAt)
    }, 200)
  }

  private async startTap(): Promise<void> {
    if (!this.media) return

    const context = new AudioContext({ sampleRate: TARGET_RATE })
    await context.audioWorklet.addModule(workletUrl)

    const source = context.createMediaStreamSource(this.media)
    const tap = new AudioWorkletNode(context, 'pcm-tap')
    tap.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const samples =
        context.sampleRate === TARGET_RATE
          ? event.data
          : resampleChunk(event.data, context.sampleRate, TARGET_RATE)
      this.onPcm?.(samples)
    }

    // A worklet only runs while it is part of a path to the destination, so
    // route it through a muted gain node instead of playing the lecture back.
    const silence = context.createGain()
    silence.gain.value = 0
    source.connect(tap)
    tap.connect(silence)
    silence.connect(context.destination)

    this.audioContext = context
    this.tap = tap
  }

  stop(): Promise<{ blob: Blob; durationMs: number; mime: string }> {
    const recorder = this.recorder
    if (!recorder || recorder.state === 'inactive') {
      this.cleanup()
      throw new Error('Not recording')
    }

    const durationMs = Date.now() - this.startedAt
    const mime = recorder.mimeType || 'audio/webm'

    return new Promise((resolve, reject) => {
      recorder.addEventListener(
        'stop',
        () => {
          try {
            const blob = new Blob(this.chunks, { type: mime })
            this.cleanup()
            resolve({ blob, durationMs, mime })
          } catch (error) {
            this.cleanup()
            reject(error)
          }
        },
        { once: true }
      )
      recorder.stop()
    })
  }

  cancel(): void {
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    } catch {
      // Discarding.
    }
    this.cleanup()
    this.chunks = []
  }

  private cleanup(): void {
    if (this.timer) window.clearInterval(this.timer)
    this.timer = undefined
    this.recorder = undefined
    if (this.tap) {
      this.tap.port.onmessage = null
      this.tap.disconnect()
      this.tap = undefined
    }
    void this.audioContext?.close().catch(() => undefined)
    this.audioContext = undefined
    this.media?.getTracks().forEach((track) => track.stop())
    this.media = undefined
  }
}
