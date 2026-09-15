import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

export function recordingsDir(): string {
  const dir = join(app.getPath('userData'), 'recordings')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function databasePath(): string {
  mkdirSync(app.getPath('userData'), { recursive: true })
  return join(app.getPath('userData'), 'catch.sqlite')
}

export function wasmCandidates(): string[] {
  return [
    join(process.resourcesPath, 'sql-wasm.wasm'),
    join(app.getAppPath(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
    join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm')
  ]
}

export function existingWasm(): string {
  const found = wasmCandidates().find((candidate) => existsSync(candidate))
  if (!found) {
    throw new Error('Could not find sql-wasm.wasm. Reinstall dependencies and try again.')
  }
  return found
}
