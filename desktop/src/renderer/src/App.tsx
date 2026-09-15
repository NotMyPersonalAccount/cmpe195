import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Recording, RecordingSummary, StorageInfo, Task } from '@shared/types'
import { defaultTitle } from '@shared/format'
import { extractTasks } from '@shared/extractTasks'
import { ConsentModal } from './components/ConsentModal'
import { PrivacyPanel } from './components/PrivacyPanel'
import { HistoryList } from './components/HistoryList'
import { RecorderBar } from './components/RecorderBar'
import { TranscriptPanel } from './components/TranscriptPanel'
import { TaskList } from './components/TaskList'
import { AudioPlayer } from './components/AudioPlayer'
import { MicRecorder } from './lib/recorder'
import { decodeTo16k } from './lib/audio'
import { transcribe } from './lib/transcribe'

type RecStatus = 'idle' | 'recording' | 'processing'

export default function App(): React.JSX.Element {
  const recorderRef = useRef(new MicRecorder())
  const saveTimer = useRef<number | null>(null)

  const [ready, setReady] = useState(false)
  const [consentNeeded, setConsentNeeded] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [summaries, setSummaries] = useState<RecordingSummary[]>([])
  const [selected, setSelected] = useState<Recording | null>(null)
  const [recStatus, setRecStatus] = useState<RecStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [processingMessage, setProcessingMessage] = useState('')
  const [banner, setBanner] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)

  const locked = recStatus === 'recording'

  useEffect(() => {
    async function boot(): Promise<void> {
      const [consent, info, list] = await Promise.all([
        window.api.getSetting('consentAccepted'),
        window.api.storageInfo(),
        window.api.listRecordings()
      ])
      setConsentNeeded(consent !== 'true')
      setStorage(info)
      setSummaries(list)
      if (list[0]) {
        const full = await window.api.getRecording(list[0].id)
        if (full) {
          setSelected(full)
          setTitleDraft(full.title)
        }
      }
      setReady(true)
    }
    void boot()
  }, [])

  useEffect(() => {
    recorderRef.current.onTick = setElapsedMs
  }, [])

  const persist = useCallback(
    async (recording: Recording, extra?: Partial<Recording>) => {
      const next: Recording = { ...recording, ...extra }
      const saved = await window.api.updateRecording({
        id: next.id,
        title: next.title,
        transcript: next.transcript,
        status: next.status,
        errorMessage: next.errorMessage,
        tasks: next.tasks
      })
      setSelected(saved)
      setTitleDraft(saved.title)
      setSummaries(await window.api.listRecordings())
      return saved
    },
    []
  )

  const queueSave = useCallback(
    (recording: Recording) => {
      if (recording.status !== 'ready') return
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        void persist(recording)
      }, 400)
    },
    [persist]
  )

  async function processAudio(recording: Recording, blob: Blob): Promise<void> {
    setRecStatus('processing')
    setProcessingMessage('Preparing audio…')
    try {
      const pcm = await decodeTo16k(blob)
      const text = await transcribe(pcm, setProcessingMessage)
      const extracted = extractTasks(text, new Date(recording.createdAt))
      const now = Date.now()
      const tasks: Task[] = extracted.map((item, index) => ({
        id: crypto.randomUUID(),
        recordingId: recording.id,
        description: item.description,
        deadlineIso: item.deadlineIso,
        deadlineLabel: item.deadlineLabel,
        completed: false,
        sortOrder: index,
        createdAt: now,
        updatedAt: now
      }))
      await persist(recording, {
        transcript: text,
        status: 'ready',
        errorMessage: null,
        tasks
      })
      setBanner(tasks.length ? `Found ${tasks.length} task${tasks.length === 1 ? '' : 's'}. Edit anything that looks off.` : 'No tasks found. You can add them yourself.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcription failed.'
      await persist(recording, { status: 'error', errorMessage: message })
      setBanner(message)
    } finally {
      setRecStatus('idle')
      setProcessingMessage('')
    }
  }

  async function startRecording(): Promise<void> {
    setBanner(null)
    const allowed = await window.api.requestMicAccess()
    if (!allowed) {
      setBanner('Microphone access is off. Enable it in System Settings, then try again.')
      return
    }
    try {
      await recorderRef.current.start()
      setElapsedMs(0)
      setRecStatus('recording')
      setSelected(null)
      setTitleDraft(defaultTitle())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start the microphone.'
      setBanner(message)
    }
  }

  async function stopRecording(): Promise<void> {
    try {
      const { blob, durationMs, mime } = await recorderRef.current.stop()
      if (blob.size < 1000) {
        setRecStatus('idle')
        setElapsedMs(0)
        setBanner('That recording was empty. Try again closer to the speaker.')
        return
      }
      const created = await window.api.createRecording({
        id: crypto.randomUUID(),
        title: titleDraft || defaultTitle(),
        durationMs,
        audio: await blob.arrayBuffer(),
        audioMime: mime
      })
      setSelected(created)
      setTitleDraft(created.title)
      setSummaries(await window.api.listRecordings())
      await processAudio(created, blob)
    } catch (error) {
      recorderRef.current.cancel()
      setRecStatus('idle')
      setElapsedMs(0)
      setBanner(error instanceof Error ? error.message : 'Could not save the recording.')
    }
  }

  function cancelRecording(): void {
    recorderRef.current.cancel()
    setRecStatus('idle')
    setElapsedMs(0)
    setBanner('Recording discarded.')
  }

  async function selectRecording(id: string): Promise<void> {
    const full = await window.api.getRecording(id)
    if (!full) return
    setSelected(full)
    setTitleDraft(full.title)
    setBanner(null)
  }

  async function deleteRecording(id: string): Promise<void> {
    const item = summaries.find((entry) => entry.id === id)
    const ok = window.confirm(`Delete “${item?.title ?? 'this recording'}”? The audio, transcript, and tasks will be removed from this computer.`)
    if (!ok) return
    await window.api.deleteRecording(id)
    const list = await window.api.listRecordings()
    setSummaries(list)
    if (selected?.id === id) {
      const next = list[0] ? await window.api.getRecording(list[0].id) : null
      setSelected(next)
      setTitleDraft(next?.title ?? '')
    }
  }

  async function retrySelected(): Promise<void> {
    if (!selected) return
    const audio = await window.api.getAudio(selected.id)
    const blob = new Blob([audio.data], { type: audio.mime })
    await persist(selected, { status: 'processing', errorMessage: null })
    await processAudio(selected, blob)
  }

  async function saveNow(): Promise<void> {
    if (!selected) return
    await persist({ ...selected, title: titleDraft || selected.title })
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 1400)
  }

  const panelStatus = useMemo(() => {
    if (recStatus === 'recording') return 'recording' as const
    if (recStatus === 'processing') return 'processing' as const
    if (!selected) return 'idle' as const
    return selected.status
  }, [recStatus, selected])

  if (!ready) {
    return <div className="boot">Opening Catch…</div>
  }

  return (
    <div className="app">
      {consentNeeded ? (
        <ConsentModal
          onAccept={() => {
            void window.api.setSetting('consentAccepted', 'true')
            setConsentNeeded(false)
          }}
        />
      ) : null}
      {showPrivacy ? (
        <PrivacyPanel
          info={storage}
          onClose={() => setShowPrivacy(false)}
          onReveal={(path) => void window.api.reveal(path)}
        />
      ) : null}

      <HistoryList
        recordings={summaries}
        selectedId={selected?.id ?? null}
        recordingLocked={locked}
        onSelect={(id) => void selectRecording(id)}
        onDelete={(id) => void deleteRecording(id)}
      />

      <main className="main">
        <header className="topbar">
          <div>
            <p className="brand">Catch</p>
            <p className="tagline">Lectures in. To-dos out. Nothing uploaded.</p>
          </div>
          <button type="button" className="btn ghost" onClick={() => setShowPrivacy(true)}>
            Privacy
          </button>
        </header>

        <RecorderBar
          status={recStatus}
          elapsedMs={elapsedMs}
          processingMessage={processingMessage}
          onStart={() => void startRecording()}
          onStop={() => void stopRecording()}
          onCancel={cancelRecording}
        />

        {banner ? <p className="banner">{banner}</p> : null}

        <div className="session-head">
          <input
            className="title-input"
            value={titleDraft}
            onChange={(event) => {
              setTitleDraft(event.target.value)
              if (selected) {
                const next = { ...selected, title: event.target.value }
                setSelected(next)
                queueSave(next)
              }
            }}
            placeholder="Untitled recording"
            disabled={recStatus === 'processing'}
            aria-label="Recording title"
          />
          <button
            type="button"
            className="btn"
            onClick={() => void saveNow()}
            disabled={!selected || recStatus !== 'idle'}
          >
            {savedFlash ? 'Saved' : 'Save'}
          </button>
          {selected ? (
            <button
              type="button"
              className="btn ghost danger-text"
              onClick={() => void deleteRecording(selected.id)}
              disabled={locked || recStatus === 'processing'}
            >
              Delete
            </button>
          ) : null}
        </div>

        <AudioPlayer recordingId={recStatus === 'idle' ? selected?.id ?? null : null} mime={selected?.audioMime} />

        <div className="split">
          <TranscriptPanel
            transcript={selected?.transcript ?? ''}
            status={panelStatus}
            errorMessage={selected?.errorMessage ?? null}
            processingMessage={processingMessage}
            onRetry={selected ? () => void retrySelected() : undefined}
            onChange={(value) => {
              if (!selected) return
              const next = { ...selected, transcript: value }
              setSelected(next)
              queueSave(next)
            }}
          />
          <TaskList
            tasks={selected?.tasks ?? []}
            disabled={!selected || recStatus !== 'idle' || selected.status === 'processing'}
            onChange={(tasks) => {
              if (!selected) return
              const next = { ...selected, tasks }
              setSelected(next)
              queueSave(next)
            }}
          />
        </div>
      </main>
    </div>
  )
}
