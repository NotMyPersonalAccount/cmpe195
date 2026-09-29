/**
 * Drives the real transcription and task-extraction pipeline over a recorded
 * audio file, without a microphone or the Electron UI.
 *
 * It replays the file the way the audio worklet feeds the app during a live
 * recording — small buffers, cut into segments at pauses — so the numbers here
 * reflect what a student actually gets, including whether a laptop can keep up
 * with a lecture in real time.
 *
 *   node --experimental-strip-types scripts/check-pipeline.ts /path/to.wav
 *
 * Defaults to a synthesised lecture generated with `say` (see lecture.txt).
 */
import { readFileSync } from 'node:fs'
import { pipeline } from '@huggingface/transformers'
import { findCutPoint, isProbablySilent } from '../src/shared/segmentAudio.ts'
import { extractTasks } from '../src/shared/extractTasks.ts'
import { cleanTranscriptText } from '../src/shared/cleanTranscript.ts'
import { SPEECH_MODEL_ID } from '../src/shared/model.ts'

const SAMPLE_RATE = 16000
const WORKLET_CHUNK = 4096

type Transcriber = (
  audio: Float32Array,
  options: Record<string, unknown>
) => Promise<{ text?: string } | Array<{ text?: string }>>

function readWav(path: string): Float32Array {
  const buffer = readFileSync(path)

  let offset = 12
  let dataStart = -1
  let dataLength = 0
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    if (id === 'data') {
      dataStart = offset + 8
      dataLength = size
      break
    }
    offset += 8 + size + (size % 2)
  }
  if (dataStart < 0) throw new Error('No data chunk in WAV')

  const count = Math.floor(dataLength / 2)
  const samples = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    samples[i] = buffer.readInt16LE(dataStart + i * 2) / 32768
  }
  return samples
}

/** Splits audio exactly the way LiveTranscriber does while recording. */
function segment(samples: Float32Array): Float32Array[] {
  const segments: Float32Array[] = []
  let buffer = new Float32Array(0)

  const concat = (left: Float32Array, right: Float32Array): Float32Array => {
    const out = new Float32Array(left.length + right.length)
    out.set(left, 0)
    out.set(right, left.length)
    return out
  }

  for (let i = 0; i < samples.length; i += WORKLET_CHUNK) {
    buffer = concat(buffer, samples.subarray(i, Math.min(i + WORKLET_CHUNK, samples.length)))
    let cut = findCutPoint(buffer, SAMPLE_RATE)
    while (cut > 0) {
      segments.push(buffer.slice(0, cut))
      buffer = buffer.slice(cut)
      cut = findCutPoint(buffer, SAMPLE_RATE)
    }
  }
  if (buffer.length > 0) segments.push(buffer)
  return segments
}

function textOf(result: { text?: string } | Array<{ text?: string }>): string {
  const text = Array.isArray(result)
    ? result
        .map((item) => item.text?.trim())
        .filter(Boolean)
        .join(' ')
    : (result.text ?? '').trim()
  return cleanTranscriptText(text)
}

function seconds(samples: number): number {
  return samples / SAMPLE_RATE
}

function report(label: string, transcript: string, recordedAt: Date): void {
  const tasks = extractTasks(transcript, recordedAt)
  console.log(`\n${label}`)
  console.log('-'.repeat(label.length))
  console.log(`transcript: ${transcript}`)
  console.log(`\n${tasks.length} task(s):`)
  for (const task of tasks) {
    const when = task.deadlineIso ?? task.deadlineLabel ?? 'no deadline'
    console.log(`  [ ] ${task.description}  (${when})`)
  }
}

async function main(): Promise<void> {
  const path = process.argv[2] ?? '/tmp/catch-test/lecture.wav'
  const samples = readWav(path)
  const recordedAt = new Date()

  console.log(`audio: ${path}`)
  console.log(`length: ${seconds(samples.length).toFixed(1)}s at ${SAMPLE_RATE} Hz`)

  const loadStart = Date.now()
  const model = (await pipeline('automatic-speech-recognition', SPEECH_MODEL_ID, {
    dtype: 'q8'
  })) as unknown as Transcriber
  console.log(`model ready in ${((Date.now() - loadStart) / 1000).toFixed(1)}s`)

  const segments = segment(samples)
  console.log(
    `\nsegmenter produced ${segments.length} chunk(s): ` +
      segments.map((chunk) => `${seconds(chunk.length).toFixed(1)}s`).join(', ')
  )

  const liveParts: string[] = []
  let liveCompute = 0
  for (const [index, chunk] of segments.entries()) {
    if (isProbablySilent(chunk)) {
      console.log(`  chunk ${index + 1}: silent, skipped`)
      continue
    }
    const started = Date.now()
    const text = textOf(await model(chunk, {}))
    const took = (Date.now() - started) / 1000
    liveCompute += took
    liveParts.push(text.trim())
    console.log(
      `  chunk ${index + 1}: ${seconds(chunk.length).toFixed(1)}s audio in ${took.toFixed(1)}s ` +
        `(${(took / seconds(chunk.length)).toFixed(2)}x realtime)`
    )
  }

  const fullStart = Date.now()
  const fullText = textOf(
    await model(samples, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5
    })
  )
  const fullCompute = (Date.now() - fullStart) / 1000

  report('LIVE (chunked at pauses, what you see while recording)', liveParts.join(' '), recordedAt)
  report('FULL PASS (Transcribe again, one shot over the saved audio)', fullText, recordedAt)

  const audioSeconds = seconds(samples.length)
  console.log('\nSPEED')
  console.log('-----')
  console.log(
    `live:  ${liveCompute.toFixed(1)}s compute for ${audioSeconds.toFixed(1)}s audio ` +
      `(${(liveCompute / audioSeconds).toFixed(2)}x realtime — under 1.00 keeps up with a lecture)`
  )
  console.log(
    `full:  ${fullCompute.toFixed(1)}s compute for ${audioSeconds.toFixed(1)}s audio ` +
      `(${(fullCompute / audioSeconds).toFixed(2)}x realtime — this is the wait after pressing stop)`
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
