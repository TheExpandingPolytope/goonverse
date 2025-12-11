import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useMemo,
  useState,
} from 'react'
import {
  usePrivy,
  useWallets,
  type ConnectedWallet,
} from '@privy-io/react-auth'
import { useBalance, useAccount } from 'wagmi'
import { useSetActiveWallet } from '@privy-io/wagmi'
import { formatUnits } from 'viem'

type WalletContextValue = {
  /** All connected wallets (embedded + external) */
  wallets: ConnectedWallet[]
  /** Currently selected wallet for transactions */
  activeWallet: ConnectedWallet | null
  /** Active wallet address */
  activeAddress: `0x${string}` | null
  /** Whether the user has an embedded wallet */
  hasEmbeddedWallet: boolean
  /** Native ETH balance of active wallet */
  ethBalance: number
  /** Whether balance is currently being fetched */
  isBalanceLoading: boolean
  /** Select a wallet by address */
  selectWallet: (address: string) => void
  /** Refresh the native balance */
  refreshBalance: () => Promise<void>
  /** Check if wallets are still loading */
  isLoading: boolean
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined)

export const WalletProvider = ({ children }: PropsWithChildren) => {
  const { ready, authenticated, user } = usePrivy()
  const { wallets } = useWallets()
  const { setActiveWallet } = useSetActiveWallet()
  
  // wagmi hooks for active wallet
  const { address: wagmiAddress } = useAccount()
  
  // User's explicit wallet selection (null = auto-select)
  const [userSelectedAddress, setUserSelectedAddress] = useState<string | null>(null)

  // Find embedded wallet
  const embeddedWallet = useMemo(() => {
    return wallets.find((w) => w.walletClientType === 'privy')
  }, [wallets])

  const hasEmbeddedWallet = !!embeddedWallet

  // Derive active address: wagmi's active > user selection > embedded > first wallet
  const activeAddress = useMemo((): `0x${string}` | null => {
    if (!ready || !authenticated) return null

    // Prefer wagmi's active address if available
    if (wagmiAddress) {
      return wagmiAddress
    }

    // If user explicitly selected and it's still valid
    if (userSelectedAddress && wallets.some((w) => w.address === userSelectedAddress)) {
      return userSelectedAddress as `0x${string}`
    }

    // Auto-select: prefer embedded, then first
    if (embeddedWallet) {
      return embeddedWallet.address as `0x${string}`
    }

    if (wallets.length > 0) {
      return wallets[0].address as `0x${string}`
    }

    return null
  }, [ready, authenticated, wagmiAddress, userSelectedAddress, wallets, embeddedWallet])

  const activeWallet = useMemo(() => {
    if (!activeAddress) return null
    return wallets.find((w) => w.address === activeAddress) ?? null
  }, [wallets, activeAddress])

  // Use wagmi's useBalance hook for native ETH balance
  const { 
    data: balanceData, 
    isLoading: isBalanceLoading,
    refetch: refetchBalance 
  } = useBalance({
    address: activeAddress ?? undefined,
  })

  // Convert balance to number
  const ethBalance = useMemo(() => {
    if (!balanceData) return 0
    return parseFloat(formatUnits(balanceData.value, balanceData.decimals))
  }, [balanceData])

  const selectWallet = useCallback(async (address: string) => {
    setUserSelectedAddress(address)
    
    // Also update wagmi's active wallet
    const wallet = wallets.find((w) => w.address === address)
    if (wallet) {
      await setActiveWallet(wallet)
    }
  }, [wallets, setActiveWallet])

  const refreshBalance = useCallback(async () => {
    await refetchBalance()
  }, [refetchBalance])

  const isLoading = !ready || (authenticated && wallets.length === 0 && !!user?.wallet)

  const value = useMemo<WalletContextValue>(
    () => ({
      wallets,
      activeWallet,
      activeAddress,
      hasEmbeddedWallet,
      ethBalance,
      isBalanceLoading,
      selectWallet,
      refreshBalance,
      isLoading,
    }),
    [wallets, activeWallet, activeAddress, hasEmbeddedWallet, ethBalance, isBalanceLoading, selectWallet, refreshBalance, isLoading],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

// Export for hook file
export { WalletContext }
export type { WalletContextValue }
