type Props = {
  onAccept: () => void
}

export function ConsentModal({ onAccept }: Props): React.JSX.Element {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="modal">
        <p className="eyebrow">Before you record</p>
        <h2 id="consent-title">Get permission. Keep it local.</h2>
        <p>
          Catch records from this laptop’s microphone, turns the audio into a transcript on this
          computer, and builds a to-do list you can edit. It is meant for live lectures, meetings, and
          conversations — after the people in the room agree.
        </p>
        <ul className="plain-list">
          <li>Ask instructors, classmates, and anyone else before you start recording.</li>
          <li>The microphone is used only while a recording is in progress.</li>
          <li>Recordings, transcripts, and tasks are stored in this app’s folder on your computer.</li>
          <li>
            Your audio is not uploaded. The first transcription may download a speech model; that
            download is the model, not your lecture.
          </li>
          <li>You can delete any recording, transcript, and its tasks from history at any time.</li>
        </ul>
        <p className="fine">This app cannot recover a lecture that already happened unless you record it live.</p>
        <button type="button" className="btn primary wide" onClick={onAccept}>
          I understand
        </button>
      </div>
    </div>
  )
}
