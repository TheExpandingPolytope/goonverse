import { useState, useCallback } from 'react'
import { env } from '@/lib/env'

export interface JoinEligibilityResult {
  canJoin: boolean
  action?: 'spawn' | 'reconnect'
  roomId?: string
  depositId?: string
  spawnAmount?: string
  reason?: string
  wallet?: string
  serverId?: string
}

export interface UseJoinEligibilityReturn {
  /** Check join eligibility for a server */
  checkEligibility: (serverId: string, accessToken: string) => Promise<JoinEligibilityResult>
  /** Loading state */
  isLoading: boolean
  /** Error message */
  error: string | null
  /** Last eligibility result */
  result: JoinEligibilityResult | null
}

/**
 * Hook for checking join eligibility via the server
 * 
 * This queries the server to determine if the user:
 * - Has an unused deposit (can spawn)
 * - Has an existing live entity (can reconnect)
 * - Needs to make a new deposit
 * 
 * Usage:
 * ```tsx
 * const { checkEligibility, isLoading, result } = useJoinEligibility()
 * 
 * const handlePlay = async () => {
 *   const eligibility = await checkEligibility(serverId, accessToken)
 *   
 *   if (eligibility.canJoin && eligibility.action === 'spawn') {
 *     // Already has unused deposit, can join directly
 *     await joinGame({ serverId, depositId: eligibility.depositId, wallet })
 *   } else if (!eligibility.canJoin) {
 *     // Need to deposit first
 *     const depositResult = await deposit(serverId, buyInEth)
 *     await joinGame({ serverId, depositId: depositResult.depositId, wallet })
 *   }
 * }
 * ```
 */
export function useJoinEligibility(): UseJoinEligibilityReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<JoinEligibilityResult | null>(null)

  const checkEligibility = useCallback(
    async (serverId: string, accessToken: string): Promise<JoinEligibilityResult> => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(
          `${env.httpOrigin}/join-eligibility?serverId=${encodeURIComponent(serverId)}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Server returned ${response.status}`)
        }

        const data = (await response.json()) as JoinEligibilityResult
        setResult(data)
        return data
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to check eligibility'
        setError(message)
        console.error('[useJoinEligibility] Error:', err)

        // Return a default "needs deposit" result on error
        return {
          canJoin: false,
          reason: 'error',
        }
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  return {
    checkEligibility,
    isLoading,
    error,
    result,
  }
}

