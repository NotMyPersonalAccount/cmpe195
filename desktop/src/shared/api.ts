import type {
  CreateRecordingInput,
  Recording,
  RecordingSummary,
  PreferenceKey,
  StorageTarget,
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
  getSetting: (key: PreferenceKey) => Promise<string | null>
  setSetting: (key: PreferenceKey, value: string) => Promise<void>
  storageInfo: () => Promise<StorageInfo>
  revealStorage: (target: StorageTarget) => Promise<void>
  requestMicAccess: () => Promise<boolean>
}
