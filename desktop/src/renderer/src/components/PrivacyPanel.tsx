import type { StorageInfo } from '@shared/types'

type Props = {
  info: StorageInfo | null
  onClose: () => void
  onReveal: (path: string) => void
}

export function PrivacyPanel({ info, onClose, onReveal }: Props): React.JSX.Element {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
      <div className="modal wide-modal">
        <p className="eyebrow">Privacy</p>
        <h2 id="privacy-title">What leaves this computer</h2>
        <p className="lede">Nothing you record is sent to a server. Catch is a local desktop app.</p>
        <dl className="facts">
          <div>
            <dt>Microphone</dt>
            <dd>Used only after you click Start Recording, and released when you stop or cancel.</dd>
          </div>
          <div>
            <dt>Recordings</dt>
            <dd>
              {info?.recordingsDir ?? 'Application data / recordings'}
              {info ? (
                <button type="button" className="linkish" onClick={() => onReveal(info.recordingsDir)}>
                  Show folder
                </button>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Transcripts and tasks</dt>
            <dd>
              {info?.databasePath ?? 'Application data / catch.sqlite'}
              {info ? (
                <button type="button" className="linkish" onClick={() => onReveal(info.databasePath)}>
                  Show database
                </button>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Speech model</dt>
            <dd>
              Downloaded once from Hugging Face into this app’s local cache, then reused offline. Your
              audio is processed here, not on their servers.
            </dd>
          </div>
          <div>
            <dt>Deleting data</dt>
            <dd>
              Use Delete on a recording in history to remove the audio, transcript, and tasks. You can
              also delete the Catch folder in application support.
            </dd>
          </div>
        </dl>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
