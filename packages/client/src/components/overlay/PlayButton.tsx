import { useEffect, useMemo, useRef, useState } from 'react'
import { useFundWallet } from '@privy-io/react-auth'
import { ChevronDown, Globe, Loader2, Wifi } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useWallet } from '@/hooks/useWallet'
import { useGameSession } from '@/hooks/useGameSession'
import { useDeposit } from '@/hooks/useDeposit'
import { useJoinEligibility } from '@/hooks/useJoinEligibility'
import { env } from '@/lib/env'
import { base, baseSepolia, foundry } from 'viem/chains'
import type { RoomSummary } from '@/types/rooms'
import { useUI } from '@/hooks/useUI'
import { useEthUsdPrice } from '@/hooks/useEthUsdPrice'
import { ethToUsd, formatEth, formatUsd } from '@/lib/formatter'

// Chain config for funding
const chains = {
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
  [foundry.id]: foundry,
} as const

const chain = chains[env.chainId as keyof typeof chains] ?? baseSepolia

type PlayButtonProps = {
  servers: RoomSummary[]
  displayName: string | null
}

type PlayPhase =
  | 'idle'
  | 'checking'      // Checking join eligibility
  | 'depositing'    // Waiting for deposit tx confirmation
  | 'joining'       // Joining the game room

export const PlayButton = ({ servers, displayName }: PlayButtonProps) => {
  const { isAuthenticated, login, getAccessToken, status } = useAuth()
  const { ethBalance, activeAddress, isLoading: walletLoading, refreshBalance } = useWallet()
  const { joinGame, phase: sessionPhase } = useGameSession()
  const { fundWallet } = useFundWallet()
  const { deposit, state: depositState, error: depositError, reset: resetDeposit } = useDeposit()
  const { checkEligibility } = useJoinEligibility()
  const { hideOverlay } = useUI()
  const { ethUsd } = useEthUsdPrice()

  // Local state
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [playPhase, setPlayPhase] = useState<PlayPhase>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isFunding, setIsFunding] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Derive selected server
  const selectedServer = useMemo(() => {
    if (selectedServerId) {
      return servers.find((s) => s.serverId === selectedServerId) ?? servers[0] ?? null
    }
    return servers[0] ?? null
  }, [servers, selectedServerId])

  // Buy-in from selected server
  const buyInEth = selectedServer?.buyInEth ?? 0
  const buyInUsd = ethToUsd(buyInEth, ethUsd)
  const potUsd = ethToUsd(selectedServer?.totalWorldEth ?? 0, ethUsd)

  const isLoading = status === 'loading' || walletLoading
  const needsFunding = isAuthenticated && activeAddress && ethBalance < buyInEth

  // Combined busy state
  const isBusy = playPhase !== 'idle' || sessionPhase === 'joining' || isFunding || depositState === 'pending'

  // Helper text based on current state
  const helperText = useMemo(() => {
    // Show errors first
    if (errorMessage) return errorMessage
    if (depositError) return depositError

    // Show phase-specific messages
    if (playPhase === 'checking') return 'Checking eligibility...'
    if (playPhase === 'depositing' || depositState === 'confirming') return 'Confirm the deposit in your wallet...'
    if (depositState === 'pending') return 'Waiting for deposit confirmation...'
    if (playPhase === 'joining' || sessionPhase === 'joining') return 'Joining game...'
    if (isFunding) return 'Complete the funding flow in the popup...'

    // Default states
    if (!selectedServer) return 'No live servers available right now.'
    if (isLoading) return 'Loading...'
    if (!isAuthenticated) return 'Sign in with Privy to store your winnings.'
    if (!activeAddress) return 'Waiting for wallet...'
    if (needsFunding) {
      const missingEth = buyInEth - ethBalance
      const missingUsd = ethToUsd(missingEth, ethUsd)
      return `You need ${formatUsd(missingUsd, true)} (${formatEth(missingEth)}) more to play.`
    }

    return `You'll spawn into ${selectedServer.name} with ~${formatUsd(buyInUsd, true)} (${formatEth(buyInEth)}) at risk.`
  }, [
    errorMessage,
    depositError,
    playPhase,
    depositState,
    sessionPhase,
    isFunding,
    selectedServer,
    isLoading,
    isAuthenticated,
    activeAddress,
    needsFunding,
    buyInEth,
    ethBalance,
    ethUsd,
    buyInUsd,
  ])

  // Fund wallet flow
  const handleFundWallet = async () => {
    if (!activeAddress) return

    const amountNeeded = Math.max(buyInEth - ethBalance, 0.0001)

    setIsFunding(true)
    setErrorMessage(null)

    try {
      await fundWallet({
        address: activeAddress,
        options: {
          chain,
          asset: 'native-currency',
          amount: amountNeeded.toString(),
        },
      })
      await refreshBalance()
    } catch (error) {
      console.error('[PlayButton] Funding failed:', error)
      // User likely closed modal - not an error
    } finally {
      setIsFunding(false)
    }
  }

  // Main play flow
  const handlePlay = async () => {
    setErrorMessage(null)
    resetDeposit()

    if (!selectedServer) return

    // Step 1: Ensure authenticated
    if (!isAuthenticated) {
      login()
      return
    }

    // Step 2: Wait for wallet
    if (!activeAddress) {
      setErrorMessage('Please wait for your wallet to load.')
      return
    }

    // Step 3: Check funds
    if (ethBalance < buyInEth) {
      await handleFundWallet()
      return
    }

    try {
      // Step 4: Get fresh access token
      const accessToken = await getAccessToken()
      if (!accessToken) {
        setErrorMessage('Failed to get authentication token. Please try again.')
        return
      }

      // Step 5: Check join eligibility
      setPlayPhase('checking')
      const eligibility = await checkEligibility(selectedServer.serverId, accessToken)
      console.log('[PlayButton] Join eligibility:', eligibility)

      let depositId: string | undefined
      let roomId: string | undefined

      if (eligibility.canJoin && eligibility.action === 'reconnect') {
        // Has a live entity - reconnect without depositing
        console.log('[PlayButton] Reconnecting to existing entity')
        roomId = eligibility.roomId
      } else if (eligibility.canJoin && eligibility.depositId) {
        // Has unused deposit - can join directly
        console.log('[PlayButton] Using existing deposit:', eligibility.depositId)
        depositId = eligibility.depositId
      } else {
        // Need to deposit first
        console.log('[PlayButton] No unused deposit, making new deposit...')
        setPlayPhase('depositing')

        const depositResult = await deposit(selectedServer.serverId, buyInEth)
        if (!depositResult) {
          // Deposit failed or was cancelled
          setPlayPhase('idle')
          return
        }

        console.log('[PlayButton] Deposit successful:', depositResult.depositId)
        depositId = depositResult.depositId

        // Refresh balance after deposit
        await refreshBalance()

        // Wait for indexer to process the deposit into the ledger
        // Poll eligibility until balance appears (max 15 seconds)
        console.log('[PlayButton] Waiting for indexer to process deposit...')
        const maxWaitMs = 15000
        const pollIntervalMs = 1000
        const startTime = Date.now()
        let indexerReady = false

        while (Date.now() - startTime < maxWaitMs) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
          const recheckEligibility = await checkEligibility(selectedServer.serverId, accessToken)
          console.log('[PlayButton] Recheck eligibility:', recheckEligibility)
          
          if (recheckEligibility.canJoin && recheckEligibility.action !== 'deposit_required') {
            indexerReady = true
            // If the recheck shows we have a depositId, use it
            if (recheckEligibility.depositId) {
              depositId = recheckEligibility.depositId
            }
            break
          }
        }

        if (!indexerReady) {
          console.error('[PlayButton] Indexer did not process deposit in time')
          setErrorMessage('Deposit is being processed. Please try again in a few seconds.')
          setPlayPhase('idle')
          return
        }
      }

      // Step 6: Join the game
      setPlayPhase('joining')
      const joined = await joinGame(
        {
          serverId: selectedServer.serverId,
          buyInEth,
          roomId,
          depositId,
          wallet: activeAddress,
          wsEndpoint: selectedServer.wsEndpoint,
          displayName: displayName ?? undefined,
        },
        accessToken
      )

      if (joined) {
        // Success - hide overlay globally and reset state
        hideOverlay()
        setPlayPhase('idle')
      } else {
        setErrorMessage('Failed to join game. Please try again.')
        setPlayPhase('idle')
      }
    } catch (error) {
      console.error('[PlayButton] Play flow failed:', error)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to join game. Please try again.')
      setPlayPhase('idle')
    }
  }

  // Button label based on state
  const buttonLabel = useMemo(() => {
    if (playPhase === 'checking') return 'Checking...'
    if (playPhase === 'depositing' || depositState === 'confirming' || depositState === 'pending') return 'Depositing...'
    if (playPhase === 'joining' || sessionPhase === 'joining') return 'Joining...'
    if (isFunding) return 'Funding...'
    if (!isAuthenticated) return 'Sign In to Play'
    if (needsFunding) return 'Add Funds'
    return 'Play'
  }, [playPhase, depositState, sessionPhase, isFunding, isAuthenticated, needsFunding])

  const isButtonDisabled = !selectedServer || isBusy || isLoading

  useEffect(() => {
    if (!isMenuOpen) return
    const onDocClick = (event: MouseEvent) => {
      const el = menuRef.current
      if (!el) return
      if (event.target instanceof Node && !el.contains(event.target)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [isMenuOpen])

  return (
    <div>
      <div className="mb-5" ref={menuRef}>
        <button
          type="button"
          onClick={() => setIsMenuOpen((v) => !v)}
          disabled={isBusy || servers.length === 0}
          aria-expanded={isMenuOpen}
          className="w-full px-4 py-3.5 rounded-xl input-premium text-left flex items-center justify-between font-medium text-[15px] focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-2.5">
            <Globe className="w-4 h-4 text-gray-500" />
            <span className="text-white">{selectedServer?.name ?? 'No servers'}</span>
            {selectedServer ? (
              <div className="flex flex-col leading-tight">
                <span className="text-[#4ade80] font-bold text-glow-green-subtle">
                  {formatUsd(buyInUsd, true)}
                </span>
                <span className="text-[10px] text-gray-500">{formatEth(buyInEth)}</span>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-gray-600 flex items-center gap-1">
              <Wifi className="w-3 h-3" />
              {selectedServer?.pingMs != null ? `${Math.round(selectedServer.pingMs)}ms` : '--'}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </div>
        </button>

        {isMenuOpen && servers.length > 0 ? (
          <div className="relative">
            <div className="absolute z-30 mt-2 w-full bg-[#0c0c12]/98 backdrop-blur-2xl border border-white/[0.08] rounded-xl p-1.5 shadow-2xl">
              {servers.map((server) => {
                const isSelected = selectedServer?.serverId === server.serverId
                return (
                  <button
                    key={server.serverId}
                    type="button"
                    onClick={() => {
                      setSelectedServerId(server.serverId)
                      setIsMenuOpen(false)
                    }}
                    className={`w-full text-left px-3 py-3 rounded-lg cursor-pointer transition-all ${
                      isSelected ? 'bg-[#4ade80]/10 border border-[#4ade80]/20' : 'hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full text-sm">
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-gray-600" />
                        <span className="font-semibold text-white">{server.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end leading-tight">
                          <span className="font-bold text-[#4ade80]">{formatUsd(ethToUsd(server.buyInEth, ethUsd), true)}</span>
                          <span className="text-[10px] text-gray-500">{formatEth(server.buyInEth)}</span>
                        </div>
                        <span className="text-xs text-gray-600 flex items-center gap-1">
                          <Wifi className="w-3 h-3" />
                          {server.pingMs != null ? `${Math.round(server.pingMs)}ms` : '--'}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      {selectedServer ? (
        <div className="flex items-center justify-center gap-4 sm:gap-5 mb-5 text-[13px]">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base text-[#4ade80] text-glow-green-subtle">
                {formatUsd(buyInUsd, true)}
              </span>
              <span className="text-gray-500 font-medium">entry</span>
            </div>
            <span className="text-[10px] text-gray-500">{formatEth(buyInEth)}</span>
          </div>
          <span className="w-1 h-1 rounded-full bg-gray-700"></span>
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-base text-white">{selectedServer.playerCount}</span>
            <span className="text-gray-500 font-medium">playing</span>
          </div>
          <span className="w-1 h-1 rounded-full bg-gray-700"></span>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base text-[#4ade80] text-glow-green-subtle">
                {formatUsd(potUsd, true)}
              </span>
              <span className="text-gray-500 font-medium">pot</span>
            </div>
            <span className="text-[10px] text-gray-500">{formatEth(selectedServer.totalWorldEth ?? 0)}</span>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={handlePlay}
        disabled={isButtonDisabled}
        className={[
          'relative w-full py-4 sm:py-[18px] px-6 rounded-xl font-black text-xl sm:text-2xl tracking-wide',
          'transition-all duration-200 flex items-center justify-center gap-2.5',
          'bg-gradient-to-b from-[#86efac] via-[#4ade80] to-[#16a34a]',
          'text-[#052e16]',
          !isButtonDisabled ? 'hover:from-[#bbf7d0] hover:via-[#86efac] hover:to-[#22c55e] hover:scale-[1.02] active:scale-[0.98]' : '',
          isButtonDisabled ? 'opacity-60 cursor-not-allowed' : '',
        ].join(' ')}
        style={{
          boxShadow: isButtonDisabled
            ? 'none'
            : '0 0 40px -8px rgba(74, 222, 128, 0.6), 0 0 80px -16px rgba(74, 222, 128, 0.3), 0 8px 32px -4px rgba(0, 0, 0, 0.4)',
        }}
      >
        {isBusy || isLoading ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" /> : null}
        {buttonLabel}
      </button>

      <p className={`mt-3 text-[13px] leading-relaxed font-medium ${errorMessage || depositError ? 'text-red-400' : 'text-gray-500'}`}>
        {helperText}
      </p>
    </div>
  )
}
