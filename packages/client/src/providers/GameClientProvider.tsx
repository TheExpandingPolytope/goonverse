import { createContext, type PropsWithChildren, useCallback, useMemo, useRef, useState } from 'react'
import type { Room } from 'colyseus.js'
import { env } from '@/lib/env'
import { getGameClient } from '@/lib/colyseusClient'
import type { ClientInputMessage } from '@/world/adapters'
import { isSnapshotReady } from '@/world/snapshot'

type ExitTicketMessage = {
  serverId: string
  sessionId: string
  player: string
  payout: string
  deadline: string
  signature: string
}

type ExitErrorMessage = {
  message?: string
}

// Server-driven visible-world snapshot (best-parity visibility deltas)
type DeltaWorldSnapshot = {
  init: unknown | null
  tick: number
  // Visible nodes only (per-client)
  nodes: Map<number, unknown>
  ownedIds: number[]
  // Dynamic border state (POC parity)
  border?: { radius: number; targetRadius: number; velocity: number }
}

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
  /** Optional roomId to join directly (reconnect path) */
  roomId?: string
  /** Deposit transaction ID (after on-chain deposit) */
  depositId?: string
  /** Player's wallet address */
  wallet?: `0x${string}`
  /** Optional WebSocket endpoint for this room */
  wsEndpoint?: string
  /** Optional player display name to share in-game */
  displayName?: string
}

type GameClientContextValue = {
  clientEndpoint: string
  phase: SessionPhase
  room: Room | null
  /** Current client's sessionId inside the active room, if any */
  sessionId: string | null
  /** Latest exit ticket received from the server (testing) */
  exitTicket: ExitTicketMessage | null
  /** Latest exit error message (testing) */
  exitError: string | null
  /** Clear exit ticket/error from UI */
  clearExit: () => void
  /**
   * Get the latest authoritative game state snapshot from the Colyseus room.
   * This is a lightweight accessor used by the canvas adapter.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getStateSnapshot: () => any | null
  /**
   * Send an input payload to the active game room.
   * No-ops if there is no active room.
   */
  sendInput: (input: ClientInputMessage) => void
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
  const [room, setRoom] = useState<Room | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [exitTicket, setExitTicket] = useState<ExitTicketMessage | null>(null)
  const [exitError, setExitError] = useState<string | null>(null)

  const clearExit = useCallback(() => {
    setExitTicket(null)
    setExitError(null)
  }, [])

  // Refs so non-React code (canvas adapter) always sees latest values
  const roomRef = useRef<Room | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latestStateRef = useRef<any | null>(null)

  const wsEndpoint = useMemo(() => getWsEndpoint(env.httpOrigin), [])

  const getStateSnapshot = useCallback(() => latestStateRef.current, [])

  const sendInput = useCallback(
    (input: ClientInputMessage) => {
      const activeRoom = roomRef.current
      if (!activeRoom) return
      try {
        activeRoom.send('input', input)
      } catch (error) {
        console.error('[GameClient] Failed to send input message:', error)
      }
    },
    [],
  )

  const leaveGame = useCallback(async () => {
    setPhase('exiting')
    const activeRoom = roomRef.current
    if (activeRoom) {
      try {
        await activeRoom.leave()
      } catch (error) {
        console.error('[GameClient] Failed to leave room:', error)
      }
    }
    roomRef.current = null
    latestStateRef.current = null
    setRoom(null)
    setSessionId(null)
    setPhase('idle')
  }, [])

  const joinGame = useCallback(
    async (options: JoinGameOptions, accessToken: string): Promise<boolean> => {
      const endpoint = options.wsEndpoint ?? wsEndpoint
      const client = getGameClient(endpoint)

      if (!accessToken) {
        console.error('[GameClient] Missing access token when attempting to join')
        return false
      }

      setPhase('joining')
      setExitTicket(null)
      setExitError(null)

      try {
        // Attach Privy token so it is sent as Authorization header
        // for matchmaking and HTTP requests.
        // See: https://docs.colyseus.io/client
        client.auth.token = accessToken

        const joinOptions = {
          serverId: options.serverId,
          buyInEth: options.buyInEth,
          depositId: options.depositId,
          wallet: options.wallet,
          displayName: options.displayName,
        }

        const joinedRoom = options.roomId
          ? await client.joinById(options.roomId, joinOptions)
          : await client.joinOrCreate('game', joinOptions)

        roomRef.current = joinedRoom
        setRoom(joinedRoom)
        setSessionId(joinedRoom.sessionId)

        // Prefer best-parity delta stream if the server provides it.
        // We keep the shape opaque here and let the canvas adapter interpret it.
        const deltaSnapshot: DeltaWorldSnapshot = {
          init: null,
          tick: 0,
          nodes: new Map<number, unknown>(),
          ownedIds: [],
        }
        latestStateRef.current = deltaSnapshot

        joinedRoom.onMessage('world:init', (init) => {
          deltaSnapshot.init = init
          deltaSnapshot.nodes.clear()
          deltaSnapshot.ownedIds = []
          deltaSnapshot.tick = 0
          // Ensure canvas reads the delta snapshot even if onStateChange fired before init arrived.
          latestStateRef.current = deltaSnapshot
        })

        joinedRoom.onMessage('world:delta', (delta) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d = delta as any
          if (typeof d?.tick === 'number') deltaSnapshot.tick = d.tick

          const removed: unknown[] = Array.isArray(d?.removedIds) ? d.removedIds : []
          for (const id of removed) {
            if (typeof id === 'number') deltaSnapshot.nodes.delete(id)
          }

          const nodes: unknown[] = Array.isArray(d?.nodes) ? d.nodes : []
          for (const n of nodes) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const nn = n as any
            if (typeof nn?.id === 'number') {
              deltaSnapshot.nodes.set(nn.id, nn)
            }
          }

          const owned: unknown[] = Array.isArray(d?.ownedIds) ? d.ownedIds : []
          deltaSnapshot.ownedIds = owned.filter((x): x is number => typeof x === 'number')

          // Extract border state (POC parity)
          if (d?.border && typeof d.border === 'object') {
            deltaSnapshot.border = {
              radius: typeof d.border.radius === 'number' ? d.border.radius : 700,
              targetRadius: typeof d.border.targetRadius === 'number' ? d.border.targetRadius : 700,
              velocity: typeof d.border.velocity === 'number' ? d.border.velocity : 0,
            }
          }

          // Keep the delta snapshot as the canonical render source.
          latestStateRef.current = deltaSnapshot
        })

        // Back-compat: if the server still uses full Schema sync, keep a valid snapshot too.
        joinedRoom.onStateChange((state) => {
          if (!deltaSnapshot.init && isSnapshotReady(state)) {
            latestStateRef.current = state
          }
        })

        joinedRoom.onMessage('exitTicket', (raw) => {
          const ticket = raw as ExitTicketMessage
          setExitTicket(ticket)
          setExitError(null)

          try {
            localStorage.setItem('exitTicket:last', JSON.stringify(ticket))
          } catch {
            // ignore
          }

          // Return to lobby after successful exit (testing UX)
          void leaveGame()
        })

        joinedRoom.onMessage('exitError', (raw) => {
          const msg = (raw as ExitErrorMessage)?.message ?? 'Exit failed'
          setExitError(msg)
        })

        setPhase('ingame')
        return true
      } catch (error) {
        console.error('[GameClient] Failed to join game:', error)

        setPhase('idle')
        return false
      }
    },
    [wsEndpoint, leaveGame],
  )

  const value = useMemo<GameClientContextValue>(
    () => ({
      clientEndpoint: wsEndpoint,
      phase,
      room,
      sessionId,
      exitTicket,
      exitError,
      clearExit,
      getStateSnapshot,
      sendInput,
      joinGame,
      leaveGame,
    }),
    [wsEndpoint, phase, room, sessionId, exitTicket, exitError, clearExit, getStateSnapshot, sendInput, joinGame, leaveGame],
  )

  return <GameClientContext.Provider value={value}>{children}</GameClientContext.Provider>
}

// Export for hook file
export { GameClientContext }
export type { GameClientContextValue, JoinGameOptions, SessionPhase }
