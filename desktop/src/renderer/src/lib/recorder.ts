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
  onTick?: (elapsedMs: number) => void

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

    this.startedAt = Date.now()
    this.recorder.start(1000)
    this.timer = window.setInterval(() => {
      this.onTick?.(Date.now() - this.startedAt)
    }, 200)
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
    this.media?.getTracks().forEach((track) => track.stop())
    this.media = undefined
  }
}
