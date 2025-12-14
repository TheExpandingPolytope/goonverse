import { useEffect, useMemo, useState } from 'react'
import { PlayButton } from './PlayButton'
import { useRooms } from '@/hooks/useRooms'
import { useUI } from '@/hooks/useUI'
import { useAuth } from '@/hooks/useAuth'

export const Overlay = () => {
  const { rooms } = useRooms()
  const { isOverlayVisible } = useUI()
  const { isAuthenticated, primaryHandle, userId } = useAuth()

  const storageKey = useMemo(() => {
    if (!userId) return null
    return `displayName:${userId}`
  }, [userId])

  const [customDisplayName, setCustomDisplayName] = useState<string>('')

  useEffect(() => {
    if (!storageKey) {
      setCustomDisplayName('')
      return
    }
    try {
      const stored = localStorage.getItem(storageKey)
      setCustomDisplayName(stored ?? '')
    } catch {
      setCustomDisplayName('')
    }
  }, [storageKey])

  const effectiveDisplayName = (customDisplayName.trim() || primaryHandle || '').trim()

  if (!isOverlayVisible) {
    return null
  }

  return (
    <div className="overlay">
      <div className="overlay__card-container">
        <div className="overlay__card">
          <h1 className="overlay__title">agarcash.io</h1>
          <p className="overlay__subtitle">Earn real money playing agar.</p>
          <div className="overlay__field">
            <label className="overlay__label" htmlFor="display-name">
              Display name (optional)
            </label>
            <input
              id="display-name"
              className="overlay__input"
              value={customDisplayName}
              onChange={(e) => {
                const next = e.target.value
                setCustomDisplayName(next)
                if (!storageKey) return
                try {
                  localStorage.setItem(storageKey, next)
                } catch {
                  // ignore
                }
              }}
              placeholder={primaryHandle ?? 'Your name'}
              disabled={!isAuthenticated}
              maxLength={24}
              autoComplete="nickname"
            />
          </div>
          <PlayButton servers={rooms} displayName={effectiveDisplayName || null} />
        </div>
      </div>
    </div>
  )
}

