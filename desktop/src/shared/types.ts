export type RecordingStatus = 'processing' | 'ready' | 'error'

export type Task = {
  id: string
  recordingId: string
  description: string
  deadlineIso: string | null
  deadlineLabel: string | null
  completed: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export type RecordingSummary = {
  id: string
  title: string
  createdAt: number
  durationMs: number
  isBookmarked: boolean
  status: RecordingStatus
  errorMessage: string | null
  taskCount: number
  completedCount: number
}

export type Recording = RecordingSummary & {
  audioPath: string
  audioMime: string
  transcript: string
  tasks: Task[]
}

export type NewTaskInput = {
  id?: string
  description: string
  deadlineIso?: string | null
  deadlineLabel?: string | null
  completed?: boolean
  sortOrder?: number
  createdAt?: number
  updatedAt?: number
}

export type PreferenceKey = 'consentAccepted' | 'liveTranscript'
export type StorageTarget = 'recordings' | 'database' | 'diagnostics'

export type DiagnosticValue = string | number | boolean | null
export type DiagnosticDetails = Record<string, DiagnosticValue>

export type CreateRecordingInput = {
  id: string
  title: string
  durationMs: number
  audio: ArrayBuffer
  audioMime: string
}

export type UpdateRecordingInput = {
  id: string
  title?: string
  isBookmarked?: boolean
  transcript?: string
  status?: RecordingStatus
  errorMessage?: string | null
  tasks?: NewTaskInput[]
}

export type StorageInfo = {
  userDataDir: string
  recordingsDir: string
  databasePath: string
  diagnosticsPath: string
  anythingLeavesComputer: boolean
  processing: string
}

export type ExtractedTask = {
  description: string
  deadlineIso: string | null
  deadlineLabel: string | null
}
