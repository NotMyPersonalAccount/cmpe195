export type TranscribeProgress = (message: string) => void

type WorkerResponse =
  | { type: 'progress'; message: string }
  | { type: 'done'; requestId: number; text: string }
  | { type: 'error'; requestId: number; message: string }

let worker: Worker | null = null
let requestId = 0
const pending = new Map<
  number,
  { resolve: (text: string) => void; reject: (error: Error) => void; onProgress?: TranscribeProgress }
>()

function ensureWorker(): Worker {
  if (worker) return worker

  worker = new Worker(new URL('../workers/transcribe.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const data = event.data
    if (data.type === 'progress') {
      pending.forEach((item) => item.onProgress?.(data.message))
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
    worker?.terminate()
    worker = null
  }
  return worker
}

export function transcribe(audio: Float32Array, onProgress?: TranscribeProgress): Promise<string> {
  const id = ++requestId
  const target = ensureWorker()

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress })
    onProgress?.('Starting local transcription…')
    const copy = audio.slice()
    target.postMessage({ type: 'transcribe', requestId: id, audio: copy.buffer, sampleRate: 16000 }, [copy.buffer])
  })
}

export function cancelTranscription(): void {
  pending.forEach((item) => item.reject(new Error('Transcription cancelled')))
  pending.clear()
  worker?.terminate()
  worker = null
}
