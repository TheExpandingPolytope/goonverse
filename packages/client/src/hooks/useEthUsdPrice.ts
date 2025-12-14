import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

type EthUsdPriceState = {
  ethUsd: number | null
  isLoading: boolean
  lastUpdatedAt: number | null
  error: string | null
}

const STORAGE_KEY = 'ethUsdPrice:v1'
const DEFAULT_POLL_MS = 60_000

type Stored = {
  ethUsd: number
  lastUpdatedAt: number
}

function readStored(): Stored | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Stored>
    if (typeof parsed.ethUsd !== 'number') return null
    if (typeof parsed.lastUpdatedAt !== 'number') return null
    if (!Number.isFinite(parsed.ethUsd) || parsed.ethUsd <= 0) return null
    return { ethUsd: parsed.ethUsd, lastUpdatedAt: parsed.lastUpdatedAt }
  } catch {
    return null
  }
}

function writeStored(next: Stored) {
  try {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

async function fetchEthUsd(): Promise<Stored> {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
    {
      method: 'GET',
      headers: { accept: 'application/json' },
    },
  )
  if (!res.ok) {
    throw new Error(`Price fetch failed: ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as { ethereum?: { usd?: number } }
  const ethUsd = json?.ethereum?.usd
  if (typeof ethUsd !== 'number' || !Number.isFinite(ethUsd) || ethUsd <= 0) {
    throw new Error('Invalid price response')
  }
  return { ethUsd, lastUpdatedAt: Date.now() }
}

/**
 * Fetch and cache ETH→USD price using CoinGecko simple price endpoint.
 * Cached in localStorage and refreshed on an interval.
 */
export function useEthUsdPrice(pollMs: number = DEFAULT_POLL_MS): EthUsdPriceState {
  const stored = readStored()

  const query = useQuery({
    queryKey: ['ethUsdPrice'],
    queryFn: fetchEthUsd,
    refetchInterval: pollMs,
    staleTime: pollMs,
    retry: 2,
    initialData: stored ?? undefined,
    initialDataUpdatedAt: stored?.lastUpdatedAt,
  })

  const data = query.data

  // Persist fresh value whenever query updates successfully.
  useEffect(() => {
    if (!data?.ethUsd || !data.lastUpdatedAt) return
    writeStored(data)
  }, [data])

  return useMemo(
    () => ({
      ethUsd: data?.ethUsd ?? null,
      isLoading: query.isPending,
      lastUpdatedAt: data?.lastUpdatedAt ?? null,
      error: query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null,
    }),
    [data?.ethUsd, data?.lastUpdatedAt, query.isPending, query.error],
  )
}


