import { formatTimer } from '@shared/format'

type Status = 'idle' | 'recording' | 'processing'

type Props = {
  status: Status
  elapsedMs: number
  processingMessage: string
  liveEnabled: boolean
  liveQueued: number
  onToggleLive: (next: boolean) => void
  onStart: () => void
  onStop: () => void
  onCancel: () => void
}

export function RecorderBar({
  status,
  elapsedMs,
  processingMessage,
  liveEnabled,
  liveQueued,
  onToggleLive,
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
              <p className="recorder-note">
                {liveEnabled
                  ? liveQueued > 1
                    ? `Transcribing as you go · ${liveQueued} chunks to catch up`
                    : 'Transcribing as you go, on this computer.'
                  : 'Recording stays on this computer. Stop when class ends.'}
              </p>
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
        {status === 'idle' ? (
          <label className="switch" title="Transcribe while recording instead of waiting until you stop">
            <input
              type="checkbox"
              checked={liveEnabled}
              onChange={(event) => onToggleLive(event.target.checked)}
            />
            <span>Live transcript</span>
          </label>
        ) : null}

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
