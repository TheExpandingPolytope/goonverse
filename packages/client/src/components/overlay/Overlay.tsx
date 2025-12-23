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
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 sm:p-6">
      <div className="pointer-events-auto w-full max-w-[90%] sm:max-w-[380px]">
        <div className="card-premium backdrop-blur-2xl rounded-2xl p-6 sm:p-8">
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-3">
              <span className="gradient-text-white">globs</span>
              <span className="logo-green-glow">.fun</span>
            </h1>
            <p className="text-[13px] sm:text-sm text-gray-500 leading-relaxed max-w-[300px] mx-auto font-medium">
              Real money agar.io — Eat smaller globs, grow bigger, winner takes the pot
            </p>
          </div>

          <div className="mb-4">
            <input
              id="display-name"
              type="text"
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
              placeholder={primaryHandle ?? 'Display Name'}
              disabled={!isAuthenticated}
              maxLength={24}
              autoComplete="nickname"
              className="w-full px-4 py-3.5 rounded-xl input-premium text-[15px] text-white placeholder:text-gray-600 font-medium focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <PlayButton servers={rooms} displayName={effectiveDisplayName || null} />

          {(exitError || exitTicket) && (
            <div className="mt-6 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
              <div className="text-xs font-semibold text-gray-500 mb-2">Exit ticket (testing)</div>
              {exitError ? <div className="text-xs text-red-400 mb-2">Exit error: {exitError}</div> : null}
              {exitTicket ? (
                <textarea
                  className="w-full px-3 py-3 rounded-xl input-premium text-xs font-mono text-gray-400 focus:outline-none"
                  value={JSON.stringify(exitTicket, null, 2)}
                  readOnly
                  rows={6}
                />
              ) : null}
              {exitClaimError ? <div className="text-xs text-red-400 mt-2">Claim error: {exitClaimError}</div> : null}
              {exitClaimTxHash ? (
                <div className="text-xs text-gray-500 mt-2">Claim tx: {exitClaimTxHash.slice(0, 10)}…</div>
              ) : null}
              <div className="flex items-center gap-2 mt-3">
                {exitTicket ? (
                  <button
                    className="px-3 py-2 rounded-lg btn-secondary text-gray-300 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
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
                  className="px-3 py-2 rounded-lg btn-secondary text-gray-300 text-xs font-semibold"
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

