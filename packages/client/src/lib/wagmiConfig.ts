import { http } from 'wagmi'
import { base, baseSepolia, foundry } from 'wagmi/chains'
import { createConfig } from '@privy-io/wagmi'
import { env } from './env'

// Determine which chains to support based on env
const chains = [base, baseSepolia, foundry] as const

// Find the active chain based on env.chainId
const getActiveChain = () => {
  switch (env.chainId) {
    case base.id:
      return base
    case baseSepolia.id:
      return baseSepolia
    case foundry.id:
      return foundry
    default:
      return baseSepolia
  }
}

export const activeChain = getActiveChain()

/**
 * Wagmi config for Privy integration
 * 
 * Important: Use createConfig from @privy-io/wagmi, not from wagmi directly.
 * This ensures proper integration with Privy's wallet management.
 */
export const wagmiConfig = createConfig({
  chains,
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
    [foundry.id]: http(),
  },
})

export type WagmiConfig = typeof wagmiConfig

