import { useContext } from 'react'
import {
  GameClientContext,
  type GameClientContextValue,
  type JoinGameOptions,
  type SessionPhase,
} from '@/providers/GameClientProvider'

export type { GameClientContextValue, JoinGameOptions, SessionPhase }

export const useGameClientContext = () => {
  const ctx = useContext(GameClientContext)
  if (!ctx) throw new Error('useGameClientContext must be used within GameClientProvider')
  return ctx
}

export const useGameSession = () => {
  const { phase, joinGame, leaveGame } = useGameClientContext()

  return {
    phase,
    joinGame,
    leaveGame,
  }
}
