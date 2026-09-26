type DiagnosticValue = string | number | boolean | null

/**
 * Emits privacy-safe pipeline metadata. The Electron main process forwards
 * these tagged lines to the terminal in development, without transcript text.
 */
export function logDiagnostic(
  event: string,
  details: Record<string, DiagnosticValue> = {}
): void {
  console.info(`[Catch] ${event} ${JSON.stringify(details)}`)
}
