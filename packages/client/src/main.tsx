import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
import { PrivyProvider } from '@privy-io/react-auth'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from '@privy-io/wagmi'
import { base, baseSepolia, foundry, type Chain } from 'viem/chains'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './providers/AuthProvider'
import { WalletProvider } from './providers/WalletProvider'
import { GameClientProvider } from './providers/GameClientProvider'
import { UIProvider } from './providers/UIProvider'
import { env } from './lib/env'
import { wagmiConfig, activeChain } from './lib/wagmiConfig'

// Ensure Buffer is available in the browser for libraries that expect Node's Buffer
if (typeof globalThis.Buffer === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).Buffer = Buffer
}

// Anvil/Foundry local chain (ID 31337)
const anvil = {
  ...foundry,
  name: 'Anvil',
} as const

// Supported chains for Privy
const supportedChains: Chain[] = [base, baseSepolia, anvil]

// Create TanStack Query client
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivyProvider
      appId={env.privyAppId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#22c55e', // green accent
          logo: undefined, // Add your logo URL here
        },
        loginMethods: ['email', 'twitter', 'wallet'],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'all-users',
          },
        },
        defaultChain: activeChain,
        supportedChains,
        walletConnectCloudProjectId: undefined, // Add WalletConnect project ID for better wallet support
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <AuthProvider>
            <WalletProvider>
              <GameClientProvider>
                <UIProvider>
                  <App />
                </UIProvider>
              </GameClientProvider>
            </WalletProvider>
          </AuthProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  </StrictMode>,
)
