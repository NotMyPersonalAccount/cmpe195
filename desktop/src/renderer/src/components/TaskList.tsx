import type { Task } from '@shared/types'
import { formatDeadline } from '@shared/format'
import { isIsoDate } from '@shared/deadlines'
import { useState } from 'react'

type Props = {
  tasks: Task[]
  recordingId: string | null
  disabled: boolean
  live?: boolean
  canRebuild?: boolean
  onRebuild?: () => void
  onChange: (tasks: Task[]) => void
}

export function TaskList({
  tasks,
  recordingId,
  disabled,
  live = false,
  canRebuild = false,
  onRebuild,
  onChange
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState('')

  function update(id: string, patch: Partial<Task>): void {
    const now = Date.now()
    onChange(tasks.map((task) => (task.id === id ? { ...task, ...patch, updatedAt: now } : task)))
  }

  function remove(id: string): void {
    onChange(tasks.filter((task) => task.id !== id).map((task, index) => ({ ...task, sortOrder: index })))
  }

  function add(): void {
    const description = draft.trim()
    if (!description) return
    const now = Date.now()
    onChange([
      ...tasks,
      {
        id: crypto.randomUUID(),
        recordingId: recordingId ?? '',
        description,
        deadlineIso: null,
        deadlineLabel: null,
        completed: false,
        sortOrder: tasks.length,
        createdAt: now,
        updatedAt: now
      }
    ])
    setDraft('')
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>To-do list</h2>
        <div className="head-actions">
          {live ? (
            <span className="pill live" role="status">
              <span className="live-dot small" aria-hidden="true" />
              {tasks.length} detected
            </span>
          ) : (
            <span className="pill">
              {tasks.filter((task) => task.completed).length}/{tasks.length} done
            </span>
          )}
          {!live && onRebuild ? (
            <button
              type="button"
              className="btn small"
              onClick={onRebuild}
              disabled={disabled || !canRebuild}
              title="Read the transcript again and rebuild this list"
            >
              Rebuild from transcript
            </button>
          ) : null}
        </div>
      </header>

      {tasks.length === 0 ? (
        <p className="placeholder">
          {live
            ? 'Listening for assignments and deadlines…'
            : 'No action items yet. Add one, or wait for a recording to be processed.'}
        </p>
      ) : (
        <ul className={`tasks ${live ? 'live-preview' : ''}`} aria-live={live ? 'polite' : undefined}>
          {tasks.map((task, index) => (
            <li key={task.id} className={task.completed ? 'done' : undefined}>
              {live ? (
                <span className="live-task-number" aria-hidden="true">
                  {index + 1}
                </span>
              ) : (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    disabled={disabled}
                    onChange={(event) => update(task.id, { completed: event.target.checked })}
                  />
                  <span />
                </label>
              )}
              <div className="task-body">
                {live ? (
                  <p className="live-task-copy">{task.description}</p>
                ) : (
                  <>
                    <input
                      className="task-text"
                      value={task.description}
                      disabled={disabled}
                      onChange={(event) => update(task.id, { description: event.target.value })}
                      aria-label="Task description"
                    />
                    <div className="deadline-fields">
                      <input
                        className="task-deadline"
                        placeholder="Deadline wording"
                        value={task.deadlineLabel ?? ''}
                        disabled={disabled}
                        onChange={(event) => update(task.id, { deadlineLabel: event.target.value || null })}
                        aria-label="Original deadline wording"
                      />
                      <input
                        type="date"
                        className="task-deadline date"
                        value={task.deadlineIso ?? ''}
                        disabled={disabled}
                        onChange={(event) =>
                          update(task.id, { deadlineIso: isIsoDate(event.target.value) ? event.target.value : null })
                        }
                        aria-label="Normalized deadline date"
                      />
                    </div>
                  </>
                )}
                {formatDeadline(task.deadlineIso, task.deadlineLabel) ? (
                  <span className="deadline-chip">{formatDeadline(task.deadlineIso, task.deadlineLabel)}</span>
                ) : null}
              </div>
              {!live ? (
                <button
                  type="button"
                  className="icon-btn danger"
                  disabled={disabled}
                  onClick={() => remove(task.id)}
                  aria-label={`Delete ${task.description}`}
                >
                  Delete
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!live ? (
        <form
          className="add-task"
          onSubmit={(event) => {
            event.preventDefault()
            if (!disabled) add()
          }}
        >
          <input
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a task"
            aria-label="Add a task"
          />
          <button type="submit" className="btn" disabled={disabled || !draft.trim()}>
            Add
          </button>
        </form>
      ) : null}
    </section>
  )
}
