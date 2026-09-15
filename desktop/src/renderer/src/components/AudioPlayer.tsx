import { useEffect, useState } from 'react'

type Props = {
  recordingId: string | null
  mime?: string
}

export function AudioPlayer({ recordingId, mime }: Props): React.JSX.Element | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let revoked: string | null = null
    let cancelled = false

    async function load(): Promise<void> {
      if (!recordingId) {
        setUrl(null)
        return
      }
      const audio = await window.api.getAudio(recordingId)
      if (cancelled) return
      const blob = new Blob([audio.data], { type: audio.mime || mime || 'audio/webm' })
      revoked = URL.createObjectURL(blob)
      setUrl(revoked)
    }

    void load().catch(() => setUrl(null))

    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [recordingId, mime])

  if (!recordingId || !url) return null

  return (
    <div className="player">
      <p className="player-label">Playback</p>
      <audio controls src={url} preload="metadata" />
    </div>
  )
}
