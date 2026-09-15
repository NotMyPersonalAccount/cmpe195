import type { Task } from '@shared/types'
import { formatDeadline } from '@shared/format'
import { useState } from 'react'

type Props = {
  tasks: Task[]
  disabled: boolean
  onChange: (tasks: Task[]) => void
}

export function TaskList({ tasks, disabled, onChange }: Props): React.JSX.Element {
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
        recordingId: tasks[0]?.recordingId ?? '',
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
        <span className="pill">{tasks.filter((task) => task.completed).length}/{tasks.length} done</span>
      </header>

      {tasks.length === 0 ? (
        <p className="placeholder">No action items yet. Add one, or wait for a recording to be processed.</p>
      ) : (
        <ul className="tasks">
          {tasks.map((task) => (
            <li key={task.id} className={task.completed ? 'done' : undefined}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={task.completed}
                  disabled={disabled}
                  onChange={(event) => update(task.id, { completed: event.target.checked })}
                />
                <span />
              </label>
              <div className="task-body">
                <input
                  className="task-text"
                  value={task.description}
                  disabled={disabled}
                  onChange={(event) => update(task.id, { description: event.target.value })}
                />
                <input
                  className="task-deadline"
                  placeholder="Deadline"
                  value={task.deadlineLabel ?? task.deadlineIso ?? ''}
                  disabled={disabled}
                  onChange={(event) =>
                    update(task.id, {
                      deadlineLabel: event.target.value || null,
                      deadlineIso: looksLikeIso(event.target.value) ? event.target.value : task.deadlineIso
                    })
                  }
                />
                {formatDeadline(task.deadlineIso, null) && task.deadlineIso ? (
                  <span className="deadline-chip">{formatDeadline(task.deadlineIso, task.deadlineLabel)}</span>
                ) : null}
              </div>
              <button
                type="button"
                className="icon-btn danger"
                disabled={disabled}
                onClick={() => remove(task.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

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
    </section>
  )
}

function looksLikeIso(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}
