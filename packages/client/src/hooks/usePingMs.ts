import { useCallback, useEffect, useState } from 'react'

type PingState = {
  pingMs: number | null
  isLoading: boolean
  error: string | null
  refresh: () => void
}

type UsePingMsOptions = {
  /** Request timeout. Default: 1200ms. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 1200

// In-memory in-flight de-dupe (prevents StrictMode double-mount from making 2 pings).
let inFlight: Promise<number> | null = null
let inFlightKey: string | null = null

async function measurePingMs(httpOrigin: string, timeoutMs: number): Promise<number> {
  const key = `${httpOrigin}|${timeoutMs}`
  if (inFlight && inFlightKey === key) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/28c26f54-5ed2-4189-a8e6-df10466d39de',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'packages/client/src/hooks/usePingMs.ts:measurePingMs',message:'measurePingMs:dedupe',data:{key},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion agent log
    return inFlight
  }

  const controller = new AbortController()
  const id = window.setTimeout(() => controller.abort(), timeoutMs)

  const start = performance.now()
  const promise = (async () => {
    try {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/28c26f54-5ed2-4189-a8e6-df10466d39de',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'packages/client/src/hooks/usePingMs.ts:measurePingMs',message:'measurePingMs:start',data:{httpOrigin,timeoutMs},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion agent log

    // /ping exists on the game server; use no-store to avoid proxy caching.
    await fetch(`${httpOrigin}/ping`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'cache-control': 'no-store',
      },
    })

    const end = performance.now()
    const ms = Math.max(0, Math.round(end - start))
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/28c26f54-5ed2-4189-a8e6-df10466d39de',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'packages/client/src/hooks/usePingMs.ts:measurePingMs',message:'measurePingMs:end',data:{ms},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion agent log
    return ms
    } finally {
    window.clearTimeout(id)
    }
  })()

  inFlight = promise
  inFlightKey = key

  try {
    return await promise
  } finally {
    // Clear in-flight after completion
    if (inFlight === promise) {
      inFlight = null
      inFlightKey = null
    }
  }
}

/**
 * Measure RTT to the game server via `GET /ping`.
 */
export function usePingMs(httpOrigin: string, options?: UsePingMsOptions): PingState {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const [pingMs, setPingMs] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  const refresh = useCallback(() => {
    setRefreshNonce((x) => x + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/28c26f54-5ed2-4189-a8e6-df10466d39de',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'packages/client/src/hooks/usePingMs.ts:useEffect',message:'usePingMs:effect',data:{httpOrigin,timeoutMs,refreshNonce},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion agent log

    void (async () => {
      try {
        const measured = await measurePingMs(httpOrigin, timeoutMs)
        if (cancelled) return
        setPingMs(measured)
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/28c26f54-5ed2-4189-a8e6-df10466d39de',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'packages/client/src/hooks/usePingMs.ts:setPingMs',message:'usePingMs:setPingMs',data:{measured},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion agent log
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Ping failed')
        setPingMs(null)
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/28c26f54-5ed2-4189-a8e6-df10466d39de',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'packages/client/src/hooks/usePingMs.ts:catch',message:'usePingMs:error',data:{error:e instanceof Error?e.message:'Ping failed'},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion agent log
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [httpOrigin, timeoutMs, refreshNonce])

  return { pingMs, isLoading, error, refresh }
}


