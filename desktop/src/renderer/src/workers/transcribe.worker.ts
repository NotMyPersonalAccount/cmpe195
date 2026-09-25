/// <reference lib="webworker" />

import { env, pipeline } from '@huggingface/transformers'

type Incoming =
  | { type: 'warmup' }
  | { type: 'transcribe'; requestId: number; audio: ArrayBuffer; sampleRate: number; live?: boolean }

type Transcriber = (
  audio: Float32Array,
  options: Record<string, unknown>
) => Promise<{ text?: string } | Array<{ text?: string }>>

env.allowLocalModels = false
env.useBrowserCache = true

const wasm = env.backends.onnx?.wasm
if (wasm) wasm.numThreads = 1

let transcriber: Transcriber | null = null
let loading: Promise<Transcriber> | null = null

// One model, one GPU/WASM session: overlapping calls would contend for it and
// arrive out of order, which for live transcription means scrambled sentences.
let chain: Promise<void> = Promise.resolve()

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

function loadModel(): Promise<Transcriber> {
  if (transcriber) return Promise.resolve(transcriber)
  if (loading) return loading

  const options = {
    dtype: 'q8' as const,
    progress_callback: onProgress
  }

  loading = (async () => {
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
  })().catch((error) => {
    // A temporary download/offline failure must not poison every future retry.
    loading = null
    transcriber = null
    throw error
  })

  return loading
}

async function handle(message: Extract<Incoming, { type: 'transcribe' }>): Promise<void> {
  const { requestId, audio, sampleRate, live } = message
  try {
    if (!transcriber && !live) {
      postMessage({ type: 'progress', message: 'Loading local speech model…' })
    }
    const model = await loadModel()
    if (!live) postMessage({ type: 'progress', message: 'Transcribing on this computer…' })

    // whisper-tiny.en is English-only, and transformers.js rejects `language`
    // or `task` on such a model rather than ignoring them.
    const result = await model(new Float32Array(audio), {
      sampling_rate: sampleRate,
      return_timestamps: !live,
      chunk_length_s: 30,
      stride_length_s: 5
    })

    const text = Array.isArray(result)
      ? result
          .map((item) => item.text?.trim())
          .filter(Boolean)
          .join(' ')
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

self.onmessage = (event: MessageEvent<Incoming>) => {
  const data = event.data
  if (data.type === 'warmup') {
    void loadModel().catch(() => {
      // A failed warmup is retried by the first real segment.
    })
    return
  }
  chain = chain.then(() => handle(data))
}
