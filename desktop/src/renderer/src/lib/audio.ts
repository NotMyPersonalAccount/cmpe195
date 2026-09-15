export async function decodeTo16k(blob: Blob): Promise<Float32Array> {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    return resampleMono(decoded, 16000)
  } finally {
    await context.close()
  }
}

export function resampleMono(buffer: AudioBuffer, targetRate: number): Float32Array {
  const frames = buffer.length
  const channels = buffer.numberOfChannels
  const mono = new Float32Array(frames)

  for (let i = 0; i < frames; i++) {
    let sum = 0
    for (let channel = 0; channel < channels; channel++) {
      sum += buffer.getChannelData(channel)[i] ?? 0
    }
    mono[i] = sum / channels
  }

  if (buffer.sampleRate === targetRate) return mono

  const outLength = Math.max(1, Math.round((mono.length * targetRate) / buffer.sampleRate))
  const output = new Float32Array(outLength)
  const ratio = mono.length / outLength
  for (let i = 0; i < outLength; i++) {
    const position = i * ratio
    const left = Math.floor(position)
    const right = Math.min(left + 1, mono.length - 1)
    const mix = position - left
    output[i] = mono[left] * (1 - mix) + mono[right] * mix
  }
  return output
}
