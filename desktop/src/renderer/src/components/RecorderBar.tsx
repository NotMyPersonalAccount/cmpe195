import { formatTimer } from '@shared/format'

type Status = 'idle' | 'recording' | 'processing'

type Props = {
  status: Status
  elapsedMs: number
  processingMessage: string
  onStart: () => void
  onStop: () => void
  onCancel: () => void
}

export function RecorderBar({
  status,
  elapsedMs,
  processingMessage,
  onStart,
  onStop,
  onCancel
}: Props): React.JSX.Element {
  return (
    <section className={`recorder ${status}`} aria-live="polite">
      <div className="recorder-status">
        {status === 'recording' ? (
          <>
            <span className="live-dot" aria-hidden="true" />
            <div>
              <p className="recorder-label">Microphone is on</p>
              <p className="recorder-note">Recording stays on this computer. Stop when class ends.</p>
            </div>
          </>
        ) : status === 'processing' ? (
          <div>
            <p className="recorder-label">Processing locally</p>
            <p className="recorder-note">{processingMessage}</p>
          </div>
        ) : (
          <div>
            <p className="recorder-label">Ready to record</p>
            <p className="recorder-note">Ask the room first, then start. Cancel discards the take.</p>
          </div>
        )}
      </div>

      <p className="timer" aria-label="Recording time">
        {formatTimer(elapsedMs)}
      </p>

      <div className="recorder-actions">
        {status === 'recording' ? (
          <>
            <button type="button" className="btn primary" onClick={onStop}>
              Stop recording
            </button>
            <button type="button" className="btn ghost" onClick={onCancel}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn primary record" onClick={onStart} disabled={status === 'processing'}>
            Start recording
          </button>
        )}
      </div>
    </section>
  )
}
