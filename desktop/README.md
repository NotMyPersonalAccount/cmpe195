# Catch

Catch is a laptop app for students who are already in class with a computer open. Record a lecture or meeting, get a transcript, and walk out with an editable to-do list. Audio, text, and tasks stay on this computer.

It cannot reconstruct a class that already happened. The point is to press record after you have permission, then stop when the room is done.

## What it does

- Records from the laptop microphone, with a timer and a clear “microphone is on” state
- Transcribes locally with a Whisper model that runs in the app
- Pulls assignments, action items, and deadlines out of the transcript
- Lets you edit, check off, add, and delete tasks
- Rebuilds the list from the transcript after you correct a misheard word
- Saves recordings, transcripts, and tasks in SQLite plus local audio files
- Opens previous recordings from history and deletes them when you are done

The first transcription may download a small English speech model from Hugging Face. That download is the model, not your lecture. After that, transcription can run offline.

## Run it

Needs Node 20+ and a microphone.

```bash
cd desktop
npm install
npm test
npm run dev
```

macOS will ask for microphone access the first time you record. If the recording is silent, check System Settings → Privacy & Security → Microphone.

## Build an installer

```bash
cd desktop
npm run package:mac      # macOS .dmg
npm run package:win      # Windows
npm run package:linux    # AppImage
```

The packaged app still processes audio on the machine it is installed on. Data lives in the OS application-data folder (on macOS, under `~/Library/Application Support/Catch`).

## Privacy

- Ask people before you record them.
- The microphone is used only while a recording is in progress.
- Recordings are files in the Catch recordings folder. Transcripts and tasks are in `catch.sqlite`.
- Nothing you record is uploaded.
- Delete a row in history to remove that audio, transcript, and task list.

## Limits

This is an MVP. It does not do live captions, speaker labels, cloud sync, calendar reminders, or “what happened in the last 15 seconds.” Task extraction is useful, not perfect — edit anything it gets wrong.
