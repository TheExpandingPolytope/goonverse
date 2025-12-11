export type SessionTicket = {
  serverId: string
  sessionId: string
  payoutEth: number
  expiresAt: number
}

export type SessionPhase = 'idle' | 'joining' | 'ingame' | 'holding-exit' | 'exiting'

