import { appendFileSync, existsSync, renameSync, statSync, unlinkSync } from 'fs'
import { app } from 'electron'
import type { DiagnosticDetails, DiagnosticValue } from '@shared/types'
import { diagnosticsPath } from './paths'

const MAX_LOG_BYTES = 512 * 1024

/** Writes privacy-safe pipeline metadata to a small rotating local log. */
export function writeDiagnostic(event: unknown, details: unknown): void {
  if (typeof event !== 'string' || !/^[a-z0-9_.-]{1,80}$/i.test(event)) return

  try {
    const path = diagnosticsPath()
    if (existsSync(path) && statSync(path).size >= MAX_LOG_BYTES) {
      const previous = `${path}.1`
      if (existsSync(previous)) unlinkSync(previous)
      renameSync(path, previous)
    }
    appendFileSync(
      path,
      `${JSON.stringify({
        at: new Date().toISOString(),
        appVersion: app.getVersion(),
        event,
        details: sanitizeDetails(details)
      })}\n`,
      'utf8'
    )
  } catch {
    // Diagnostics must never interrupt recording, transcription, or saving.
  }
}

function sanitizeDetails(value: unknown): DiagnosticDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const safe: DiagnosticDetails = {}
  for (const [key, item] of Object.entries(value).slice(0, 40)) {
    if (!/^[a-z0-9_.-]{1,80}$/i.test(key)) continue
    const sanitized = sanitizeValue(item)
    if (sanitized !== undefined) safe[key] = sanitized
  }
  return safe
}

function sanitizeValue(value: unknown): DiagnosticValue | undefined {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return value.slice(0, 300)
  return undefined
}
