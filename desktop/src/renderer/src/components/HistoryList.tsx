import type { RecordingSummary } from '@shared/types'
import { formatDuration, formatWhen } from '@shared/format'

type Props = {
  recordings: RecordingSummary[]
  selectedId: string | null
  recordingLocked: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

export function HistoryList({
  recordings,
  selectedId,
  recordingLocked,
  onSelect,
  onDelete
}: Props): React.JSX.Element {
  return (
    <aside className="history">
      <div className="history-head">
        <p className="eyebrow">History</p>
        <h2>Saved on this laptop</h2>
      </div>
      {recordings.length === 0 ? (
        <p className="empty-copy">No recordings yet. Start one when class begins.</p>
      ) : (
        <ul className="history-list">
          {recordings.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`history-item ${item.id === selectedId ? 'selected' : ''}`}
                onClick={() => onSelect(item.id)}
                disabled={recordingLocked}
              >
                <span className="history-title">{item.title}</span>
                <span className="history-meta">
                  {formatWhen(item.createdAt)} · {formatDuration(item.durationMs)}
                </span>
                <span className="history-meta">
                  {item.status === 'processing'
                    ? 'Processing'
                    : item.status === 'error'
                      ? 'Needs attention'
                      : `${item.completedCount}/${item.taskCount} tasks`}
                </span>
              </button>
              <button
                type="button"
                className="icon-btn danger"
                aria-label={`Delete ${item.title}`}
                disabled={recordingLocked}
                onClick={() => onDelete(item.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
