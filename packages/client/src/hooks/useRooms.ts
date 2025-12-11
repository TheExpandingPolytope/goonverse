import { useEffect, useState, useCallback } from 'react'
import { formatUnits } from 'viem'
import type { RoomSummary } from '@/types/rooms'
import { env } from '@/lib/env'

type RawRoom = {
  roomId: string
  name: string
  clients: number
  maxClients: number
  metadata?: {
    serverId?: string
    buyInAmount?: string
    massPerEth?: number
    region?: string
    worldBalance?: string
  }
}

async function fetchRooms(): Promise<RoomSummary[]> {
  const res = await fetch(`${env.httpOrigin}/rooms`)
  if (!res.ok) {
    throw new Error(`Failed to fetch rooms: ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as { rooms: RawRoom[]; wsEndpoint?: string }

  return data.rooms.map((room) => {
    const buyInEth = room.metadata?.buyInAmount ? Number(formatUnits(BigInt(room.metadata.buyInAmount), 18)) : 0
    const totalWorldEth = room.metadata?.worldBalance ? Number(formatUnits(BigInt(room.metadata.worldBalance), 18)) : 0
    return {
      id: room.roomId,
      name: room.name,
      serverId: room.metadata?.serverId ?? room.roomId,
      playerCount: room.clients,
      maxPlayers: room.maxClients,
      buyInEth,
      totalWorldEth,
      wsEndpoint: data.wsEndpoint,
      // pingMs will be optionally filled in later by a ping routine
    }
  })
}

export const useRooms = () => {
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const next = await fetchRooms()
      setRooms(next)
    } catch (err) {
      console.error('[useRooms] Failed to fetch rooms', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch rooms')
      setRooms([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return {
    rooms,
    isLoading,
    error,
    refresh: load,
  }
}

