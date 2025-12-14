import { useMemo, useState } from 'react'
import { useFundWallet } from '@privy-io/react-auth'
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

      if (eligibility.canJoin && eligibility.depositId) {
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
      }

      // Step 6: Join the game
      setPlayPhase('joining')
      const joined = await joinGame(
        {
          serverId: selectedServer.serverId,
          buyInEth,
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

  return (
    <div>
      <div className="overlay__field">
        <label className="overlay__label" htmlFor="server-select">
          Server
        </label>
        <select
          className="overlay__select"
          id="server-select"
          value={selectedServer?.serverId ?? ''}
          onChange={(event) => setSelectedServerId(event.target.value)}
          disabled={isBusy}
        >
          {servers.length === 0 ? (
            <option value="" disabled>
              No live servers
            </option>
          ) : (
            servers.map((server) => (
              <option key={server.serverId} value={server.serverId}>
                {formatUsd(ethToUsd(server.buyInEth, ethUsd), true)} ({formatEth(server.buyInEth)}) ·{' '}
                {server.playerCount} players · {formatUsd(ethToUsd(server.totalWorldEth, ethUsd), true)} pot
              </option>
            ))
          )}
        </select>
      </div>

      <button
        type="button"
        className="play-button"
        onClick={handlePlay}
        disabled={isButtonDisabled}
      >
        {buttonLabel}
      </button>

      <p className={`overlay__helper ${errorMessage || depositError ? 'overlay__helper--error' : ''}`}>
        {helperText}
      </p>
    </div>
  )
}
