export type RoomSummary = {
  id: string
  name: string
  serverId: string
  playerCount: number
  maxPlayers: number
  buyInEth: number
  totalWorldEth: number
  /** Optional WebSocket endpoint for this room's game server */
  wsEndpoint?: string
  pingMs?: number
}

