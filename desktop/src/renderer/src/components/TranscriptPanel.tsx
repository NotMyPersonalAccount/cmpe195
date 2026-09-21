import { useEffect, useRef } from 'react'

type Props = {
  transcript: string
  status: 'idle' | 'recording' | 'processing' | 'ready' | 'error'
  errorMessage: string | null
  processingMessage: string
  liveEnabled: boolean
  liveText: string
  liveQueued: number
  liveNote: string | null
  onChange: (value: string) => void
  onRetry?: () => void
  onReTranscribe?: () => void
}

export function TranscriptPanel({
  transcript,
  status,
  errorMessage,
  processingMessage,
  liveEnabled,
  liveText,
  liveQueued,
  liveNote,
  onChange,
  onRetry,
  onReTranscribe
}: Props): React.JSX.Element {
  const liveRef = useRef<HTMLDivElement>(null)
  const live = status === 'recording' || (status === 'processing' && liveText.length > 0)

  useEffect(() => {
    if (!live) return
    const node = liveRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [live, liveText])

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Transcript</h2>
        <div className="head-actions">
          {live && liveEnabled ? (
            <span className="pill live">
              <span className="live-dot small" aria-hidden="true" />
              {liveQueued > 1 ? `Catching up · ${liveQueued} chunks` : 'Live'}
            </span>
          ) : null}
          {status === 'ready' ? <span className="pill">Editable</span> : null}
          {status === 'ready' && onReTranscribe ? (
            <button
              type="button"
              className="btn small"
              onClick={onReTranscribe}
              title="Run a slower, more accurate pass over the saved audio"
            >
              Transcribe again
            </button>
          ) : null}
        </div>
      </header>

      {live ? (
        <div className="transcript live-view" ref={liveRef}>
          {liveText ? (
            <p className="live-text">
              {liveText}
              <span className="caret" aria-hidden="true" />
            </p>
          ) : (
            <p className="placeholder">
              {liveEnabled
                ? 'Listening. Text appears after the first pause in speech.'
                : 'Live transcript is off. The transcript appears after you stop.'}
            </p>
          )}
          {liveNote ? <p className="live-note">{liveNote}</p> : null}
        </div>
      ) : status === 'processing' ? (
        <p className="placeholder">{processingMessage || 'Transcribing on this computer…'}</p>
      ) : status === 'error' ? (
        <div className="error-box">
          <p>{errorMessage || 'Transcription failed.'}</p>
          {onRetry ? (
            <button type="button" className="btn" onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </div>
      ) : status === 'idle' ? (
        <p className="placeholder">Record a lecture or meeting to see the transcript here.</p>
      ) : (
        <textarea
          className="transcript"
          value={transcript}
          onChange={(event) => onChange(event.target.value)}
          spellCheck
        />
      )}
    </section>
  )
}
