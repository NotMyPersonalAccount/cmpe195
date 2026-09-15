export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) return `${hours}:${mm}:${ss}`
  return `${mm}:${ss}`
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total}s`
  const minutes = Math.round(total / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem ? `${hours}h ${rem}m` : `${hours}h`
}

export function formatWhen(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp)
  const startToday = new Date(now)
  startToday.setHours(0, 0, 0, 0)
  const startThat = new Date(date)
  startThat.setHours(0, 0, 0, 0)
  const deltaDays = Math.round((startToday.getTime() - startThat.getTime()) / 86400000)

  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (deltaDays === 0) return `Today · ${time}`
  if (deltaDays === 1) return `Yesterday · ${time}`
  if (deltaDays < 7) {
    const weekday = date.toLocaleDateString(undefined, { weekday: 'long' })
    return `${weekday} · ${time}`
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function formatDeadline(iso: string | null, label: string | null): string | null {
  if (iso) {
    const [year, month, day] = iso.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const pretty = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    return pretty
  }
  return label
}

export function defaultTitle(at = new Date()): string {
  return at.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
