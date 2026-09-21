// Taps microphone audio on the audio thread so Whisper can transcribe while the
// lecture is still going. Storage still comes from MediaRecorder; this path only
// feeds live transcription, so dropping it never costs the student their audio.
class PcmTap extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(4096)
    this.offset = 0
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel) return true

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.offset++] = channel[i]
      if (this.offset === this.buffer.length) {
        this.port.postMessage(this.buffer.slice())
        this.offset = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-tap', PcmTap)
