import { ipcMain, shell, systemPreferences } from 'electron'
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  deleteRecording,
  getRecording,
  getSetting,
  insertRecording,
  listRecordings,
  setSetting,
  storageInfo,
  updateRecording
} from './db'
import { databasePath, diagnosticsPath, recordingsDir } from './paths'
import { writeDiagnostic } from './diagnostics'
import type {
  CreateRecordingInput,
  PreferenceKey,
  StorageTarget,
  UpdateRecordingInput
} from '@shared/types'

const preferenceKeys = new Set<PreferenceKey>(['consentAccepted', 'liveTranscript'])

function requireId(id: unknown): string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(id)) throw new Error('Invalid recording ID')
  return id
}

function requirePreference(key: unknown): PreferenceKey {
  if (!preferenceKeys.has(key as PreferenceKey)) throw new Error('Unknown preference')
  return key as PreferenceKey
}

function extensionFor(mime: string): string {
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('wav')) return 'wav'
  return 'webm'
}

export function registerIpc(): void {
  writeDiagnostic('app.started', { platform: process.platform })
  ipcMain.on('diagnostics:write', (_event, event: unknown, details: unknown) => {
    writeDiagnostic(event, details)
  })

  ipcMain.handle('recordings:list', () => listRecordings())

  ipcMain.handle('recordings:get', (_event, id: string) => getRecording(requireId(id)))

  ipcMain.handle('recordings:create', (_event, input: CreateRecordingInput) => {
    requireId(input.id)
    if (!(input.audio instanceof ArrayBuffer) || input.audio.byteLength < 1) throw new Error('Recording is empty')
    if (typeof input.title !== 'string' || typeof input.audioMime !== 'string') throw new Error('Invalid recording')
    const dir = recordingsDir()
    mkdirSync(dir, { recursive: true })
    const audioPath = join(dir, `${input.id}.${extensionFor(input.audioMime)}`)
    writeFileSync(audioPath, Buffer.from(input.audio))
    try {
      return insertRecording({
        id: input.id,
        title: input.title,
        createdAt: Date.now(),
        durationMs: input.durationMs,
        audioPath,
        audioMime: input.audioMime
      })
    } catch (error) {
      try {
        unlinkSync(audioPath)
      } catch {
        // Preserve the original database error.
      }
      throw error
    }
  })

  ipcMain.handle('recordings:update', (_event, input: UpdateRecordingInput) => {
    requireId(input.id)
    return updateRecording(input)
  })

  ipcMain.handle('recordings:delete', (_event, id: string) => {
    const safeId = requireId(id)
    const recording = getRecording(safeId)
    if (!recording) return
    try {
      unlinkSync(recording.audioPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    deleteRecording(safeId)
  })

  ipcMain.handle('recordings:audio', (_event, id: string) => {
    const recording = getRecording(requireId(id))
    if (!recording) throw new Error('Recording not found')
    const buffer = readFileSync(recording.audioPath)
    return {
      mime: recording.audioMime,
      data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    }
  })

  ipcMain.handle('settings:get', (_event, key: PreferenceKey) => getSetting(requirePreference(key)))
  ipcMain.handle('settings:set', (_event, key: PreferenceKey, value: string) => {
    setSetting(requirePreference(key), String(value))
  })

  ipcMain.handle('app:storage', () => storageInfo())

  ipcMain.handle('app:reveal-storage', (_event, target: StorageTarget) => {
    if (target === 'database') shell.showItemInFolder(databasePath())
    else if (target === 'recordings') void shell.openPath(recordingsDir())
    else if (target === 'diagnostics') shell.showItemInFolder(diagnosticsPath())
    else throw new Error('Unknown storage target')
  })

  ipcMain.handle('app:mic-access', async () => {
    if (process.platform !== 'darwin') return true
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'granted') return true
    if (status === 'denied' || status === 'restricted') return false
    return systemPreferences.askForMediaAccess('microphone')
  })
}
