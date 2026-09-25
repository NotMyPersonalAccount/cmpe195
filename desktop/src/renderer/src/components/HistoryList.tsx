import type { RecordingSummary } from '@shared/types'
import { formatDuration, formatWhen } from '@shared/format'

type Props = {
  recordings: RecordingSummary[]
  selectedId: string | null
  recordingLocked: boolean
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onToggleBookmark: (id: string) => void
  onDelete: (id: string) => void
}

export function HistoryList({
  recordings,
  selectedId,
  recordingLocked,
  onSelect,
  onRename,
  onToggleBookmark,
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
              <div className={`history-item ${item.id === selectedId ? 'selected' : ''}`}>
                <button
                  type="button"
                  className="history-open"
                  onClick={() => onSelect(item.id)}
                  disabled={recordingLocked}
                  aria-label={`Open ${item.title}`}
                >
                  Open
                </button>
                <input
                  className="history-title-input"
                  value={item.title}
                  onChange={(event) => onRename(item.id, event.target.value)}
                  disabled={recordingLocked}
                  aria-label={`Title for ${item.title}`}
                />
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
                <div className="history-actions">
                  <button
                    type="button"
                    className={`history-bookmark ${item.isBookmarked ? 'active' : ''}`}
                    aria-label={`${item.isBookmarked ? 'Remove bookmark from' : 'Bookmark'} ${item.title}`}
                    aria-pressed={item.isBookmarked}
                    title={item.isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                    disabled={recordingLocked}
                    onClick={() => onToggleBookmark(item.id)}
                  >
                    <span aria-hidden="true">{item.isBookmarked ? '★' : '☆'}</span>
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
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
