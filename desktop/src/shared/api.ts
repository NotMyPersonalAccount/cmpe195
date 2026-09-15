import type {
  CreateRecordingInput,
  Recording,
  RecordingSummary,
  StorageInfo,
  UpdateRecordingInput
} from './types'

export type CatchApi = {
  listRecordings: () => Promise<RecordingSummary[]>
  getRecording: (id: string) => Promise<Recording | null>
  createRecording: (input: CreateRecordingInput) => Promise<Recording>
  updateRecording: (input: UpdateRecordingInput) => Promise<Recording>
  deleteRecording: (id: string) => Promise<void>
  getAudio: (id: string) => Promise<{ mime: string; data: ArrayBuffer }>
  getSetting: (key: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<void>
  storageInfo: () => Promise<StorageInfo>
  reveal: (target: string) => Promise<void>
  requestMicAccess: () => Promise<boolean>
}
