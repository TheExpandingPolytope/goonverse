import { useContext } from 'react'
import { WalletContext, type WalletContextValue } from '@/providers/WalletProvider'

export type { WalletContextValue }

export const useWalletContext = () => {
  const ctx = useContext(WalletContext)
  if (!ctx) {
    throw new Error('useWalletContext must sit under WalletProvider')
  }
  return ctx
}

export const useWallet = () => useWalletContext()
