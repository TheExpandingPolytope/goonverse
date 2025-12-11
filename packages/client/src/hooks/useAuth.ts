import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from '@/providers/AuthProvider'

export type { AuthContextValue }

export const useAuthContext = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuthContext must be used within AuthProvider')
  }
  return ctx
}

export const useAuth = () => useAuthContext()
