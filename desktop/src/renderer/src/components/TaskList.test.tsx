import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Task } from '@shared/types'
import { TaskList } from './TaskList'

const liveTask: Task = {
  id: 'live-1',
  recordingId: 'live-recording',
  description: 'Submit the homework by Friday',
  deadlineIso: '2026-09-25',
  deadlineLabel: 'Friday',
  completed: false,
  sortOrder: 0,
  createdAt: 1,
  updatedAt: 1
}

describe('TaskList live preview', () => {
  it('shows detected tasks without editing controls during recording', () => {
    const html = renderToStaticMarkup(
      <TaskList
        tasks={[liveTask]}
        recordingId={null}
        disabled
        live
        onChange={() => undefined}
      />
    )

    expect(html).toContain('1 detected')
    expect(html).toContain('Submit the homework by Friday')
    expect(html).not.toContain('Add a task')
    expect(html).not.toContain('Rebuild from transcript')
  })
})
