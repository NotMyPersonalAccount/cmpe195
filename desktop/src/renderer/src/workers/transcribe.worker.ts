/// <reference lib="webworker" />

import { env, pipeline } from '@huggingface/transformers'
import { cleanTranscriptText } from '@shared/cleanTranscript'
import { SPEECH_MODEL_ID } from '@shared/model'

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
let backend: 'WebGPU' | 'WASM' | null = null

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

  loading = (async () => {
    // Whisper's encoder is unusually sensitive to quantization. In particular,
    // q8 on WebGPU can return plausible-looking garbage instead of throwing.
    // Keep the encoder at full precision and use the model export recommended
    // by Transformers.js; fall back to the reliable CPU/WASM path when needed.
    if ('gpu' in navigator) {
      postMessage({ type: 'progress', message: 'Preparing the local speech model…' })
      try {
        transcriber = (await pipeline('automatic-speech-recognition', SPEECH_MODEL_ID, {
          device: 'webgpu',
          dtype: {
            encoder_model: 'fp32',
            decoder_model_merged: 'q4'
          },
          progress_callback: onProgress
        })) as unknown as Transcriber
        backend = 'WebGPU'
      } catch {
        postMessage({
          type: 'progress',
          message: 'Graphics acceleration was unavailable. Switching to local CPU transcription…'
        })
      }
    }

    if (!transcriber) {
      transcriber = (await pipeline('automatic-speech-recognition', SPEECH_MODEL_ID, {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: onProgress
      })) as unknown as Transcriber
      backend = 'WASM'
    }

    return transcriber
  })().catch((error) => {
    // A temporary download/offline failure must not poison every future retry.
    loading = null
    transcriber = null
    backend = null
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
    postMessage({
      type: 'progress',
      message: live
        ? 'Turning the latest phrase into text…'
        : 'Transcribing on this computer…'
    })

    // The English-only Whisper model rejects `language`
    // or `task` on such a model rather than ignoring them.
    // A Float32Array input is defined by Transformers.js as 16 kHz mono PCM.
    // `sampleRate` remains in the message protocol so malformed callers can be
    // rejected instead of silently producing nonsense.
    if (sampleRate !== 16000) throw new Error(`Expected 16 kHz audio, received ${sampleRate} Hz.`)

    const result = await model(new Float32Array(audio), {
      return_timestamps: !live,
      ...(live ? {} : { chunk_length_s: 30, stride_length_s: 5 })
    })

    const rawText = Array.isArray(result)
      ? result
          .map((item) => item.text?.trim())
          .filter(Boolean)
          .join(' ')
      : (result.text ?? '').trim()
    const text = cleanTranscriptText(rawText)

    postMessage({
      type: 'done',
      requestId,
      text,
      rawChars: rawText.length,
      rawWords: wordCount(rawText),
      cleanedChars: text.length,
      cleanedWords: wordCount(text)
    })
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
    void loadModel()
      .then(() => postMessage({ type: 'ready', backend, modelId: SPEECH_MODEL_ID }))
      .catch((error) => {
        postMessage({
          type: 'warmup-error',
          message:
            error instanceof Error
              ? error.message
              : 'The local speech model could not be prepared.'
        })
      })
    return
  }
  chain = chain.then(() => handle(data))
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}
