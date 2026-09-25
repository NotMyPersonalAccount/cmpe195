import { contextBridge, ipcRenderer } from 'electron'
import type { CatchApi } from '@shared/api'
import type { CreateRecordingInput, PreferenceKey, StorageTarget, UpdateRecordingInput } from '@shared/types'

const api: CatchApi = {
  listRecordings: () => ipcRenderer.invoke('recordings:list'),
  getRecording: (id: string) => ipcRenderer.invoke('recordings:get', id),
  createRecording: (input: CreateRecordingInput) => ipcRenderer.invoke('recordings:create', input),
  updateRecording: (input: UpdateRecordingInput) => ipcRenderer.invoke('recordings:update', input),
  deleteRecording: (id: string) => ipcRenderer.invoke('recordings:delete', id),
  getAudio: (id: string) => ipcRenderer.invoke('recordings:audio', id),
  getSetting: (key: PreferenceKey) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: PreferenceKey, value: string) => ipcRenderer.invoke('settings:set', key, value),
  storageInfo: () => ipcRenderer.invoke('app:storage'),
  revealStorage: (target: StorageTarget) => ipcRenderer.invoke('app:reveal-storage', target),
  requestMicAccess: () => ipcRenderer.invoke('app:mic-access')
}

contextBridge.exposeInMainWorld('api', api)
