import { ipcMain, shell, systemPreferences } from 'electron'
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { extname, join } from 'path'
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
import { recordingsDir } from './paths'
import type { CreateRecordingInput, UpdateRecordingInput } from '@shared/types'

function extensionFor(mime: string): string {
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('wav')) return 'wav'
  return 'webm'
}

export function registerIpc(): void {
  ipcMain.handle('recordings:list', () => listRecordings())

  ipcMain.handle('recordings:get', (_event, id: string) => getRecording(id))

  ipcMain.handle('recordings:create', (_event, input: CreateRecordingInput) => {
    const dir = recordingsDir()
    mkdirSync(dir, { recursive: true })
    const audioPath = join(dir, `${input.id}.${extensionFor(input.audioMime)}`)
    writeFileSync(audioPath, Buffer.from(input.audio))
    return insertRecording({
      id: input.id,
      title: input.title,
      createdAt: Date.now(),
      durationMs: input.durationMs,
      audioPath,
      audioMime: input.audioMime
    })
  })

  ipcMain.handle('recordings:update', (_event, input: UpdateRecordingInput) => updateRecording(input))

  ipcMain.handle('recordings:delete', (_event, id: string) => {
    const audioPath = deleteRecording(id)
    if (audioPath) {
      try {
        unlinkSync(audioPath)
      } catch {
        // File may already be gone.
      }
    }
  })

  ipcMain.handle('recordings:audio', (_event, id: string) => {
    const recording = getRecording(id)
    if (!recording) throw new Error('Recording not found')
    const buffer = readFileSync(recording.audioPath)
    return {
      mime: recording.audioMime,
      data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    }
  })

  ipcMain.handle('settings:get', (_event, key: string) => getSetting(key))
  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    setSetting(key, value)
  })

  ipcMain.handle('app:storage', () => storageInfo())

  ipcMain.handle('app:reveal', (_event, target: string) => {
    if (extname(target)) shell.showItemInFolder(target)
    else shell.openPath(target)
  })

  ipcMain.handle('app:mic-access', async () => {
    if (process.platform !== 'darwin') return true
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'granted') return true
    if (status === 'denied' || status === 'restricted') return false
    return systemPreferences.askForMediaAccess('microphone')
  })
}
