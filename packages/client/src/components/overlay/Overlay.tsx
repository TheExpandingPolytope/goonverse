import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWriteContract } from 'wagmi'
import { decodeEventLog } from 'viem'
import { PlayButton } from './PlayButton'
import { useRooms } from '@/hooks/useRooms'
import { useUI } from '@/hooks/useUI'
import { useAuth } from '@/hooks/useAuth'
import { useGameClientContext } from '@/hooks/useGameSession'
import { useWallet } from '@/hooks/useWallet'
import { env } from '@/lib/env'
import { WorldAbi } from '@/lib/contracts/WorldAbi'

export const Overlay = () => {
  const { rooms } = useRooms()
  const { isOverlayVisible, showOverlay } = useUI()
  const { isAuthenticated, primaryHandle, userId } = useAuth()
  const { phase, exitTicket, exitError, clearExit } = useGameClientContext()
  const { activeAddress, refreshBalance } = useWallet()
  const { writeContractAsync } = useWriteContract()
  const [exitClaimState, setExitClaimState] = useState<'idle' | 'confirming' | 'pending' | 'success' | 'error'>('idle')
  const [exitClaimError, setExitClaimError] = useState<string | null>(null)
  const [exitClaimTxHash, setExitClaimTxHash] = useState<`0x${string}` | null>(null)

  const storageKey = useMemo(() => {
    if (!userId) return null
    return `displayName:${userId}`
  }, [userId])

  const [customDisplayName, setCustomDisplayName] = useState<string>('')

  useEffect(() => {
    if (!storageKey) {
      setCustomDisplayName('')
      return
    }
    try {
      const stored = localStorage.getItem(storageKey)
      setCustomDisplayName(stored ?? '')
    } catch {
      setCustomDisplayName('')
    }
  }, [storageKey])

  const effectiveDisplayName = (customDisplayName.trim() || primaryHandle || '').trim()

  // Ensure the overlay returns after leaving/exiting the game.
  useEffect(() => {
    if (phase !== 'ingame' && !isOverlayVisible) {
      showOverlay()
    }
  }, [phase, isOverlayVisible, showOverlay])

  const claimExitTicket = useCallback(async () => {
    if (!exitTicket) return
    if (!activeAddress) {
      setExitClaimError('No wallet connected')
      setExitClaimState('error')
      return
    }

    try {
      setExitClaimState('confirming')
      setExitClaimError(null)
      setExitClaimTxHash(null)

      const hash = await writeContractAsync({
        address: env.worldContractAddress,
        abi: WorldAbi,
        functionName: 'exitWithSignature',
        args: [
          exitTicket.serverId as `0x${string}`,
          exitTicket.sessionId as `0x${string}`,
          BigInt(exitTicket.payout),
          BigInt(exitTicket.deadline),
          exitTicket.signature as `0x${string}`,
        ],
      })

      setExitClaimTxHash(hash)
      setExitClaimState('pending')

      const publicClient = (await import('wagmi/actions')).getPublicClient((await import('@/lib/wagmiConfig')).wagmiConfig)
      const txReceipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      })

      if (txReceipt.status !== 'success') {
        throw new Error('Exit transaction failed')
      }

      // Optional: verify the Exit event exists
      for (const log of txReceipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: WorldAbi,
            data: log.data,
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          })
          if (decoded.eventName === 'Exit') break
        } catch {
          // not our event
        }
      }

      await refreshBalance()
      setExitClaimState('success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to claim exit'
      setExitClaimError(message)
      setExitClaimState('error')
    }
  }, [exitTicket, activeAddress, writeContractAsync, refreshBalance])

  if (!isOverlayVisible) {
    return null
  }

  return (
    <div className="overlay">
      <div className="overlay__card-container">
        <div className="overlay__card">
          <h1 className="overlay__title">globs.fun</h1>
          <p className="overlay__subtitle">Earn real money playing agar.</p>
          <div className="overlay__field">
            <label className="overlay__label" htmlFor="display-name">
              Display name (optional)
            </label>
            <input
              id="display-name"
              className="overlay__input"
              value={customDisplayName}
              onChange={(e) => {
                const next = e.target.value
                setCustomDisplayName(next)
                if (!storageKey) return
                try {
                  localStorage.setItem(storageKey, next)
                } catch {
                  // ignore
                }
              }}
              placeholder={primaryHandle ?? 'Your name'}
              disabled={!isAuthenticated}
              maxLength={24}
              autoComplete="nickname"
            />
          </div>
          <PlayButton servers={rooms} displayName={effectiveDisplayName || null} />

          {(exitError || exitTicket) && (
            <div className="overlay__field" style={{ marginTop: 16 }}>
              <label className="overlay__label">Exit ticket (testing)</label>
              {exitError ? <div className="overlay__subtitle">Exit error: {exitError}</div> : null}
              {exitTicket ? (
                <textarea
                  className="overlay__input"
                  value={JSON.stringify(exitTicket, null, 2)}
                  readOnly
                  rows={6}
                />
              ) : null}
              {exitClaimError ? <div className="overlay__subtitle">Claim error: {exitClaimError}</div> : null}
              {exitClaimTxHash ? (
                <div className="overlay__subtitle">Claim tx: {exitClaimTxHash.slice(0, 10)}…</div>
              ) : null}
              {exitTicket ? (
                <button
                  className="overlay__button"
                  type="button"
                  onClick={() => {
                    void claimExitTicket()
                  }}
                  disabled={exitClaimState === 'confirming' || exitClaimState === 'pending'}
                >
                  {exitClaimState === 'confirming'
                    ? 'Confirming...'
                    : exitClaimState === 'pending'
                      ? 'Claiming...'
                      : exitClaimState === 'success'
                        ? 'Claimed'
                        : 'Claim exit'}
                </button>
              ) : null}
              <button
                className="overlay__button"
                type="button"
                onClick={() => {
                  setExitClaimState('idle')
                  setExitClaimError(null)
                  setExitClaimTxHash(null)
                  clearExit()
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

