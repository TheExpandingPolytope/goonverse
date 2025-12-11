import type { RoomSummary } from '@/types/rooms'

export const summarizeServer = (room: RoomSummary) => ({
  label: `${room.name} (${room.playerCount}/${room.maxPlayers})`,
  bankroll: room.totalWorldEth,
})

