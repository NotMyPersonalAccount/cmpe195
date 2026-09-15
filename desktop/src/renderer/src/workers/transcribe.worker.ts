/// <reference lib="webworker" />

import { env, pipeline } from '@huggingface/transformers'

type Incoming = {
  type: 'transcribe'
  requestId: number
  audio: ArrayBuffer
  sampleRate: number
}

type Transcriber = (
  audio: Float32Array,
  options: Record<string, unknown>
) => Promise<{ text?: string } | Array<{ text?: string }>>

env.allowLocalModels = false
env.useBrowserCache = true

const wasm = env.backends.onnx?.wasm
if (wasm) wasm.numThreads = 1

let transcriber: Transcriber | null = null

function onProgress(info: { status?: string; progress?: number }): void {
  if (info.status === 'progress' && typeof info.progress === 'number') {
    postMessage({
      type: 'progress',
      message: `Downloading speech model… ${Math.round(info.progress)}%`
    })
    return
  }
  if (info.status === 'download' || info.status === 'initiate') {
    postMessage({
      type: 'progress',
      message: 'Downloading speech model (one-time). Your recordings stay on this computer.'
    })
  }
}

async function loadModel(): Promise<Transcriber> {
  if (transcriber) return transcriber

  const options = {
    dtype: 'q8' as const,
    progress_callback: onProgress
  }

  try {
    transcriber = (await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      ...options,
      device: 'webgpu'
    })) as unknown as Transcriber
  } catch {
    transcriber = (await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny.en',
      options
    )) as unknown as Transcriber
  }

  return transcriber
}

self.onmessage = async (event: MessageEvent<Incoming>) => {
  const { requestId, audio, sampleRate } = event.data
  try {
    postMessage({ type: 'progress', message: 'Loading local speech model…' })
    const model = await loadModel()
    postMessage({ type: 'progress', message: 'Transcribing on this computer…' })

    const result = await model(new Float32Array(audio), {
      sampling_rate: sampleRate,
      language: 'english',
      task: 'transcribe',
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5
    })

    const text = Array.isArray(result)
      ? result.map((item) => item.text?.trim()).filter(Boolean).join(' ')
      : (result.text ?? '').trim()

    postMessage({ type: 'done', requestId, text })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Transcription failed. Connect to the internet once to download the local speech model.'
    postMessage({ type: 'error', requestId, message })
  }
}
