type Props = {
  transcript: string
  status: 'idle' | 'recording' | 'processing' | 'ready' | 'error'
  errorMessage: string | null
  processingMessage: string
  onChange: (value: string) => void
  onRetry?: () => void
}

export function TranscriptPanel({
  transcript,
  status,
  errorMessage,
  processingMessage,
  onChange,
  onRetry
}: Props): React.JSX.Element {
  const editing = status === 'ready'
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Transcript</h2>
        {status === 'ready' ? <span className="pill">Editable</span> : null}
      </header>
      {status === 'recording' ? (
        <p className="placeholder">The transcript appears after you stop. Live transcription is not part of this version.</p>
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
          readOnly={!editing}
          spellCheck
        />
      )}
    </section>
  )
}
