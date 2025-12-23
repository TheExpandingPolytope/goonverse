import { useEffect, useState, useCallback } from 'react'
import { formatUnits } from 'viem'
import type { RoomSummary } from '@/types/rooms'
import { env } from '@/lib/env'
import { usePingMs } from '@/hooks/usePingMs'

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
  const { pingMs } = usePingMs(env.httpOrigin)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/28c26f54-5ed2-4189-a8e6-df10466d39de',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'packages/client/src/hooks/useRooms.ts:load',message:'useRooms:load:start',data:{httpOrigin:env.httpOrigin},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion agent log
    try {
      const fetched = await fetchRooms()
      const next =
        pingMs == null
          ? fetched
          : fetched.map((r) => ({
              ...r,
              pingMs,
            }))
      setRooms(next)
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/28c26f54-5ed2-4189-a8e6-df10466d39de',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'packages/client/src/hooks/useRooms.ts:load',message:'useRooms:load:success',data:{count:next.length,hasPingMs:next.some(r=>r.pingMs!=null)},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion agent log
    } catch (err) {
      console.error('[useRooms] Failed to fetch rooms', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch rooms')
      setRooms([])
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/28c26f54-5ed2-4189-a8e6-df10466d39de',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'packages/client/src/hooks/useRooms.ts:load',message:'useRooms:load:error',data:{error:err instanceof Error?err.message:'Failed to fetch rooms'},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion agent log
    } finally {
      setIsLoading(false)
    }
  }, [pingMs])

  useEffect(() => {
    void load()
  }, [load])

  // Attach ping to rooms once it becomes available AND whenever room list changes.
  // This avoids a race where ping resolves (or is cached) before /rooms finishes loading.
  useEffect(() => {
    if (pingMs == null) return
    setRooms((prev) => {
      let changed = false
      const next = prev.map((r) => {
        if (r.pingMs != null) return r
        changed = true
        return { ...r, pingMs }
      })
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/28c26f54-5ed2-4189-a8e6-df10466d39de',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'packages/client/src/hooks/useRooms.ts:attachPing',message:'useRooms:attachPing',data:{pingMs,prevCount:prev.length,changed,roomsLengthDep:rooms.length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion agent log
      return changed ? next : prev
    })
  }, [pingMs, rooms.length])

  return {
    rooms,
    isLoading,
    error,
    refresh: load,
  }
}

