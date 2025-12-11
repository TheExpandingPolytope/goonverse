import { createContext, type PropsWithChildren, useCallback, useMemo, useState } from 'react'
import { env } from '@/lib/env'
import { getGameClient } from '@/lib/colyseusClient'

/** Derive WebSocket URL from HTTP origin */
const getWsEndpoint = (httpOrigin: string): string => {
  const url = new URL(httpOrigin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.origin
}

type SessionPhase = 'idle' | 'joining' | 'ingame' | 'exiting'

type JoinGameOptions = {
  /** Server/room ID to join */
  serverId: string
  /** Buy-in amount in ETH */
  buyInEth: number
  /** Deposit transaction ID (after on-chain deposit) */
  depositId?: string
  /** Player's wallet address */
  wallet?: `0x${string}`
  /** Optional WebSocket endpoint for this room */
  wsEndpoint?: string
}

type GameClientContextValue = {
  clientEndpoint: string
  phase: SessionPhase
  /** 
   * Join a game room
   * @param options - Join options including serverId and buyInEth
   * @param accessToken - Fresh Privy access token for authentication
   */
  joinGame: (options: JoinGameOptions, accessToken: string) => Promise<boolean>
  leaveGame: () => Promise<void>
}

const GameClientContext = createContext<GameClientContextValue | undefined>(undefined)

export const GameClientProvider = ({ children }: PropsWithChildren) => {
  const [phase, setPhase] = useState<SessionPhase>('idle')
  const wsEndpoint = useMemo(() => getWsEndpoint(env.httpOrigin), [])

  const joinGame = useCallback(
    async (options: JoinGameOptions, accessToken: string): Promise<boolean> => {
      const endpoint = options.wsEndpoint ?? wsEndpoint
      const client = getGameClient(endpoint)

      if (!accessToken) {
        console.error('[GameClient] Missing access token when attempting to join')
        return false
      }

      setPhase('joining')

      try {
        // Attach Privy token so it is sent as Authorization header
        // for matchmaking and HTTP requests.
        // See: https://docs.colyseus.io/client
        client.auth.token = accessToken

        await client.joinOrCreate('game', {
          serverId: options.serverId,
          buyInEth: options.buyInEth,
          depositId: options.depositId,
          wallet: options.wallet,
        })

        setPhase('ingame')
        return true
      } catch (error) {
        console.error('[GameClient] Failed to join game:', error)
        setPhase('idle')
        return false
      }
    },
    [wsEndpoint],
  )

  const leaveGame = useCallback(async () => {
    setPhase('exiting')
    // TODO: Properly leave the room when Colyseus is wired
    setPhase('idle')
  }, [])

  const value = useMemo<GameClientContextValue>(
    () => ({
      clientEndpoint: wsEndpoint,
      phase,
      joinGame,
      leaveGame,
    }),
    [wsEndpoint, phase, joinGame, leaveGame],
  )

  return <GameClientContext.Provider value={value}>{children}</GameClientContext.Provider>
}

// Export for hook file
export { GameClientContext }
export type { GameClientContextValue, JoinGameOptions, SessionPhase }
