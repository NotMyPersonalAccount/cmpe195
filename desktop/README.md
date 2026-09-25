# Catch

Catch is a privacy-first Electron study assistant. It records a live lecture or
meeting, transcribes it on the laptop, extracts assignments and deadlines, and
keeps the recording, transcript, and editable to-do list together.

**Lectures in. To-dos out. Nothing uploaded.**

## Privacy model

- Catch requests microphone access only after **Start recording** is pressed.
- Microphone tracks are stopped immediately after **Stop** or **Cancel**.
- Audio is written to Catch's OS application-data directory.
- Transcripts, tasks, preferences, and recording metadata are stored in a local
  `catch.sqlite` database.
- The recording is never sent to Hugging Face or another server.
- The first transcription may download the English Whisper model from Hugging
  Face. This downloads model files, not the user's recording. The browser cache
  is reused so transcription works offline after the model is cached.
- Deleting a session permanently removes its audio file, transcript, tasks, and
  database row.

Always obtain permission from instructors, classmates, and other participants
before recording them.

## Features

- MediaRecorder audio capture with a prominent microphone state and timer
- Optional live transcript, segmented at quiet pauses and processed in order
- Local `Xenova/whisper-tiny.en` transcription in a Web Worker
- WebGPU acceleration when available, with a WASM fallback
- Full-recording **Transcribe again** pass for improved accuracy
- Heuristic extraction of academic actions and normalized deadlines
- Editable transcript, title, deadlines, and tasks with debounced autosave
- Task completion, manual task creation, deletion, and task-list rebuilding
- Completed-state preservation when matching tasks are rebuilt
- Bookmarked recordings sorted above the newest unbookmarked recordings
- Native audio playback and permanent deletion
- Actual storage locations in the privacy panel, with file-manager shortcuts
- Atomic temporary-file replacement when persisting the sql.js database

## Requirements

- Node.js 20 or newer
- npm
- A supported Windows, macOS, or Linux desktop
- A microphone for recording
- Internet access for the first model download

## Development

```bash
cd desktop
npm install
npm run dev
```

The Electron window defaults to 1280×860 and has a 960×680 minimum size.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

The Vitest suite covers silence-aware audio segmentation, silent-audio
detection, deadline normalization, task extraction and deduplication, the
25-task limit, checked-state preservation after rebuilding, and database-row
transformations.

To exercise the real Whisper and task-extraction pipeline without a microphone:

```bash
say -f scripts/lecture.txt -o /tmp/lecture.aiff
afconvert -f WAVE -d LEI16@16000 -c 1 /tmp/lecture.aiff /tmp/lecture.wav
npm run check:pipeline -- /tmp/lecture.wav
```

The `say` and `afconvert` commands are macOS utilities. On other platforms,
pass any mono 16 kHz PCM WAV to `check-pipeline.ts`.

Manual release checks should cover:

1. First-run consent and microphone permission denial.
2. Start, stop, cancel, microphone release, and quiet-recording rejection.
3. Live transcript on/off, model-download messaging, and catching-up status.
4. Full retranscription and task rebuilding confirmation.
5. Transcript, title, task, completion, and deadline autosaving.
6. Bookmark sorting, restart playback, and complete deletion.
7. Narrow-window layout, keyboard navigation, and visible focus states.
8. Offline transcription after the model has been cached.

## Packaging

```bash
npm run package:mac
npm run package:win
npm run package:linux
npm run package:dir
```

`electron-builder.yml` includes macOS microphone usage text and packages the
sql.js WASM runtime for all targets. Cross-platform installers are usually best
built on their target operating system or in CI.

## Architecture

- `src/main` — Electron window, local file storage, sql.js persistence, IPC
- `src/preload` — narrow typed bridge exposed as `window.api`
- `src/renderer` — React workspace, recording pipeline, live transcript UI
- `src/renderer/src/workers` — Whisper worker and PCM AudioWorklet
- `src/shared` — domain types, deadlines, extraction, segmentation, transforms
- `scripts/check-pipeline.ts` — reproducible local speech-to-task harness

## Known limitations

- Transcription is English-only.
- There is no speaker identification.
- There is no cloud sync or backup.
- There is no calendar integration or automatic reminder service.
- Task extraction is heuristic and intentionally editable.
- Live transcription favors speed; full retranscription favors accuracy.
- Catch cannot recover a lecture unless recording was started while it happened.
