import { useContext } from 'react'
import { UIContext, type UIContextValue } from '@/providers/UIProvider'

export const useUI = (): UIContextValue => {
  const ctx = useContext(UIContext)
  if (!ctx) {
    throw new Error('useUI must be used within a UIProvider')
  }
  return ctx
}

export type { UIContextValue }


