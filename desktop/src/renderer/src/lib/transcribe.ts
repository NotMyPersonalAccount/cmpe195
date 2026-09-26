export type TranscribeProgress = (message: string) => void

type WorkerResponse =
  | { type: 'progress'; message: string }
  | { type: 'ready'; backend: 'WebGPU' | 'WASM' }
  | { type: 'warmup-error'; message: string }
  | { type: 'done'; requestId: number; text: string }
  | { type: 'error'; requestId: number; message: string }

let worker: Worker | null = null
let workerReady = false
let requestId = 0
const pending = new Map<
  number,
  { resolve: (text: string) => void; reject: (error: Error) => void; onProgress?: TranscribeProgress }
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
      warmups.forEach((item) => item.resolve())
      warmups.clear()
      return
    }
    if (data.type === 'warmup-error') {
      const error = new Error(data.message)
      warmups.forEach((item) => item.reject(error))
      warmups.clear()
      return
    }
    const waiter = pending.get(data.requestId)
    if (!waiter) return
    pending.delete(data.requestId)
    if (data.type === 'done') waiter.resolve(data.text)
    else waiter.reject(new Error(data.message))
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

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress })
    if (!live) onProgress?.('Starting local transcription…')
    const copy = audio.slice()
    target.postMessage(
      { type: 'transcribe', requestId: id, audio: copy.buffer, sampleRate: 16000, live },
      [copy.buffer]
    )
  })
}

export function cancelTranscription(): void {
  pending.forEach((item) => item.reject(new Error('Transcription cancelled')))
  pending.clear()
  worker?.terminate()
  worker = null
  workerReady = false
}
