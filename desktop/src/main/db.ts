import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import initSqlJs, { type Database } from 'sql.js'
import type {
  NewTaskInput,
  Recording,
  RecordingStatus,
  RecordingSummary,
  StorageInfo,
  Task
} from '@shared/types'
import { databasePath, existingWasm, recordingsDir } from './paths'
import { app } from 'electron'

type Bind = Array<string | number | null>

let db: Database

export async function initDb(): Promise<void> {
  const SQL = await initSqlJs({
    locateFile: () => existingWasm()
  })
  const path = databasePath()
  if (existsSync(path)) {
    db = new SQL.Database(readFileSync(path))
  } else {
    mkdirSync(dirname(path), { recursive: true })
    db = new SQL.Database()
  }
  db.run('PRAGMA foreign_keys = ON')
  migrate()
  persist()
}

function migrate(): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      audio_path TEXT NOT NULL,
      audio_mime TEXT NOT NULL DEFAULT 'audio/webm',
      transcript TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'processing',
      error_message TEXT
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      deadline_iso TEXT,
      deadline_label TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_tasks_recording ON tasks(recording_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_recordings_created ON recordings(created_at DESC)')
}

function persist(): void {
  const path = databasePath()
  const tmp = `${path}.tmp`
  writeFileSync(tmp, Buffer.from(db.export()))
  renameSync(tmp, path)
}

function allObjects<T>(sql: string, params: Bind = []): T[] {
  const stmt = db.prepare(sql)
  if (params.length) stmt.bind(params)
  const rows: T[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return rows
}

export function listRecordings(): RecordingSummary[] {
  return allObjects<{
    id: string
    title: string
    created_at: number
    duration_ms: number
    status: RecordingStatus
    error_message: string | null
    task_count: number
    completed_count: number
  }>(
    `SELECT r.id, r.title, r.created_at, r.duration_ms, r.status, r.error_message,
            COUNT(t.id) AS task_count,
            SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END) AS completed_count
     FROM recordings r
     LEFT JOIN tasks t ON t.recording_id = r.id
     GROUP BY r.id
     ORDER BY r.created_at DESC`
  ).map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    durationMs: row.duration_ms,
    status: row.status,
    errorMessage: row.error_message,
    taskCount: Number(row.task_count) || 0,
    completedCount: Number(row.completed_count) || 0
  }))
}

export function getRecording(id: string): Recording | null {
  const rows = allObjects<{
    id: string
    title: string
    created_at: number
    duration_ms: number
    audio_path: string
    audio_mime: string
    transcript: string
    status: RecordingStatus
    error_message: string | null
  }>('SELECT * FROM recordings WHERE id = ?', [id])
  const row = rows[0]
  if (!row) return null

  const tasks = allObjects<{
    id: string
    recording_id: string
    description: string
    deadline_iso: string | null
    deadline_label: string | null
    completed: number
    sort_order: number
    created_at: number
    updated_at: number
  }>('SELECT * FROM tasks WHERE recording_id = ? ORDER BY sort_order ASC, created_at ASC', [id]).map(mapTask)

  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    durationMs: row.duration_ms,
    status: row.status,
    errorMessage: row.error_message,
    audioPath: row.audio_path,
    audioMime: row.audio_mime,
    transcript: row.transcript,
    taskCount: tasks.length,
    completedCount: tasks.filter((task) => task.completed).length,
    tasks
  }
}

function mapTask(row: {
  id: string
  recording_id: string
  description: string
  deadline_iso: string | null
  deadline_label: string | null
  completed: number
  sort_order: number
  created_at: number
  updated_at: number
}): Task {
  return {
    id: row.id,
    recordingId: row.recording_id,
    description: row.description,
    deadlineIso: row.deadline_iso,
    deadlineLabel: row.deadline_label,
    completed: Boolean(row.completed),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function insertRecording(input: {
  id: string
  title: string
  createdAt: number
  durationMs: number
  audioPath: string
  audioMime: string
}): Recording {
  db.run(
    `INSERT INTO recordings (id, title, created_at, duration_ms, audio_path, audio_mime, transcript, status)
     VALUES (?, ?, ?, ?, ?, ?, '', 'processing')`,
    [input.id, input.title, input.createdAt, input.durationMs, input.audioPath, input.audioMime]
  )
  persist()
  const created = getRecording(input.id)
  if (!created) throw new Error('Failed to create recording')
  return created
}

export function updateRecording(input: {
  id: string
  title?: string
  transcript?: string
  status?: RecordingStatus
  errorMessage?: string | null
  tasks?: NewTaskInput[]
}): Recording {
  const current = getRecording(input.id)
  if (!current) throw new Error('Recording not found')

  db.run(
    `UPDATE recordings
     SET title = ?, transcript = ?, status = ?, error_message = ?
     WHERE id = ?`,
    [
      input.title ?? current.title,
      input.transcript ?? current.transcript,
      input.status ?? current.status,
      input.errorMessage === undefined ? current.errorMessage : input.errorMessage,
      input.id
    ]
  )

  if (input.tasks) {
    db.run('DELETE FROM tasks WHERE recording_id = ?', [input.id])
    const now = Date.now()
    input.tasks.forEach((task, index) => {
      db.run(
        `INSERT INTO tasks
         (id, recording_id, description, deadline_iso, deadline_label, completed, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          task.id ?? crypto.randomUUID(),
          input.id,
          task.description,
          task.deadlineIso ?? null,
          task.deadlineLabel ?? null,
          task.completed ? 1 : 0,
          task.sortOrder ?? index,
          now,
          now
        ]
      )
    })
  }

  persist()
  const updated = getRecording(input.id)
  if (!updated) throw new Error('Recording missing after update')
  return updated
}

export function deleteRecording(id: string): string | null {
  const current = getRecording(id)
  db.run('DELETE FROM tasks WHERE recording_id = ?', [id])
  db.run('DELETE FROM recordings WHERE id = ?', [id])
  persist()
  return current?.audioPath ?? null
}

export function getSetting(key: string): string | null {
  const rows = allObjects<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
  return rows[0]?.value ?? null
}

export function setSetting(key: string, value: string): void {
  db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
    key,
    value
  ])
  persist()
}

export function storageInfo(): StorageInfo {
  return {
    userDataDir: app.getPath('userData'),
    recordingsDir: recordingsDir(),
    databasePath: databasePath(),
    anythingLeavesComputer: false,
    processing: 'Audio is transcribed on this computer. Recordings and transcripts are never uploaded.'
  }
}
