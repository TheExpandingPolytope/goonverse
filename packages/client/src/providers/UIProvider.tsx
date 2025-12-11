import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useMemo,
  useState,
} from 'react'

type UIContextValue = {
  /** Whether the main overlay (landing + play UI) is visible */
  isOverlayVisible: boolean
  /** Show the overlay */
  showOverlay: () => void
  /** Hide the overlay */
  hideOverlay: () => void
  /** Toggle overlay visibility */
  toggleOverlay: () => void
}

const UIContext = createContext<UIContextValue | undefined>(undefined)

export const UIProvider = ({ children }: PropsWithChildren) => {
  const [isOverlayVisible, setIsOverlayVisible] = useState(true)

  const showOverlay = useCallback(() => {
    setIsOverlayVisible(true)
  }, [])

  const hideOverlay = useCallback(() => {
    setIsOverlayVisible(false)
  }, [])

  const toggleOverlay = useCallback(() => {
    setIsOverlayVisible((prev) => !prev)
  }, [])

  const value = useMemo<UIContextValue>(
    () => ({
      isOverlayVisible,
      showOverlay,
      hideOverlay,
      toggleOverlay,
    }),
    [isOverlayVisible, showOverlay, hideOverlay, toggleOverlay],
  )

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export { UIContext }
export type { UIContextValue }


