import { useState } from 'react'

type SessionPhase = 'idle' | 'joining' | 'ingame' | 'holding-exit'

export const useSessionState = () => {
  const [phase, setPhase] = useState<SessionPhase>('idle')
  return {
    phase,
    setPhase,
  }
}

