import type { DiagnosticDetails } from '@shared/types'

/**
 * Emits privacy-safe pipeline metadata to the development console and a small
 * rotating local log, without transcript text.
 */
export function logDiagnostic(
  event: string,
  details: DiagnosticDetails = {}
): void {
  console.info(`[Catch] ${event} ${JSON.stringify(details)}`)
  if (typeof window !== 'undefined') window.api?.writeDiagnostic(event, details)
}
