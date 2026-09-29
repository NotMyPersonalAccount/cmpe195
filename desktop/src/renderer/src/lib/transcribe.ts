import { logDiagnostic } from './diagnostics'
import { cleanTranscriptText } from '@shared/cleanTranscript'
import { measureAudio, splitRecordingAudio } from '@shared/segmentAudio'

export type TranscribeProgress = (message: string) => void

type WorkerResponse =
  | { type: 'progress'; message: string }
  | { type: 'ready'; backend: 'WebGPU' | 'WASM'; modelId: string }
  | { type: 'warmup-error'; message: string }
  | {
      type: 'done'
      requestId: number
      text: string
      rawChars: number
      rawWords: number
      cleanedChars: number
      cleanedWords: number
    }
  | { type: 'error'; requestId: number; message: string }

let worker: Worker | null = null
let workerReady = false
let requestId = 0
const pending = new Map<
  number,
  {
    resolve: (text: string) => void
    reject: (error: Error) => void
    onProgress?: TranscribeProgress
    live: boolean
    startedAt: number
    audioSeconds: number
  }
>()
const warmups = new Set<{
  resolve: () => void
  reject: (error: Error) => void
  onProgress?: TranscribeProgress
}>()

function ensureWorker(): Worker {
  if (worker) return worker

  worker = new Worker(new URL('../workers/transcribe.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const data = event.data
    if (data.type === 'progress') {
      pending.forEach((item) => item.onProgress?.(data.message))
      warmups.forEach((item) => item.onProgress?.(data.message))
      return
    }
    if (data.type === 'ready') {
      workerReady = true
      logDiagnostic('model.ready', { backend: data.backend, modelId: data.modelId })
      warmups.forEach((item) => item.resolve())
      warmups.clear()
      return
    }
    if (data.type === 'warmup-error') {
      const error = new Error(data.message)
      logDiagnostic('model.warmup_failed', { message: data.message })
      warmups.forEach((item) => item.reject(error))
      warmups.clear()
      return
    }
    const waiter = pending.get(data.requestId)
    if (!waiter) return
    pending.delete(data.requestId)
    if (data.type === 'done') {
      logDiagnostic('transcription.complete', {
        mode: waiter.live ? 'live' : 'full',
        audioSeconds: Number(waiter.audioSeconds.toFixed(1)),
        elapsedMs: Date.now() - waiter.startedAt,
        transcriptChars: data.text.length,
        rawChars: data.rawChars,
        rawWords: data.rawWords,
        cleanedChars: data.cleanedChars,
        cleanedWords: data.cleanedWords
      })
      waiter.resolve(data.text)
    } else {
      logDiagnostic('transcription.failed', {
        mode: waiter.live ? 'live' : 'full',
        message: data.message
      })
      waiter.reject(new Error(data.message))
    }
  }
  worker.onerror = (event) => {
    const error = new Error(event.message || 'Transcription worker failed')
    pending.forEach((item) => item.reject(error))
    pending.clear()
    warmups.forEach((item) => item.reject(error))
    warmups.clear()
    worker?.terminate()
    worker = null
    workerReady = false
  }
  return worker
}

/** Starts the model download before the first segment needs it. */
export function warmUpModel(onProgress?: TranscribeProgress): Promise<void> {
  const target = ensureWorker()
  if (workerReady) return Promise.resolve()

  return new Promise((resolve, reject) => {
    warmups.add({ resolve, reject, onProgress })
    target.postMessage({ type: 'warmup' })
  })
}

export function transcribe(
  audio: Float32Array,
  onProgress?: TranscribeProgress,
  live = false
): Promise<string> {
  const id = ++requestId
  const target = ensureWorker()
  logDiagnostic('transcription.requested', {
    requestId: id,
    mode: live ? 'live' : 'full',
    ...measureAudio(audio, 16000)
  })

  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve,
      reject,
      onProgress,
      live,
      startedAt: Date.now(),
      audioSeconds: audio.length / 16000
    })
    if (!live) onProgress?.('Starting local transcription…')
    const copy = audio.slice()
    target.postMessage(
      { type: 'transcribe', requestId: id, audio: copy.buffer, sampleRate: 16000, live },
      [copy.buffer]
    )
  })
}

type TranscriptionRunner = typeof transcribe

/**
 * Transcribes saved audio in one pass, then retries with the proven live
 * segmentation path if the model unexpectedly returns no words.
 */
export async function transcribeRecording(
  audio: Float32Array,
  onProgress?: TranscribeProgress,
  run: TranscriptionRunner = transcribe
): Promise<string> {
  const fullText = (await run(audio, onProgress, false)).trim()
  if (fullText) return fullText

  const segments = splitRecordingAudio(audio, 16000)
  if (segments.length === 0) return ''

  logDiagnostic('transcription.retry_segmented', {
    audioSeconds: Number((audio.length / 16000).toFixed(1)),
    segmentCount: segments.length
  })

  const text: string[] = []
  for (let index = 0; index < segments.length; index += 1) {
    onProgress?.(`Retrying locally in shorter sections… ${index + 1}/${segments.length}`)
    const segmentText = (await run(segments[index], undefined, true)).trim()
    if (segmentText) text.push(segmentText)
  }
  return cleanTranscriptText(text.join(' '))
}

export function cancelTranscription(): void {
  pending.forEach((item) => item.reject(new Error('Transcription cancelled')))
  pending.clear()
  worker?.terminate()
  worker = null
  workerReady = false
}
