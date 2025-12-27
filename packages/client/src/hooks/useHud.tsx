import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useRef, useSyncExternalStore } from 'react'
import type { WorldViewModel } from '@/world/adapters'

type Hud = WorldViewModel['hud']
type Listener = () => void

type HudContextValue = {
  getHud: () => Hud | null
  setHud: (hud: Hud | null) => void
  subscribe: (listener: Listener) => () => void
}

const HudContext = createContext<HudContextValue | null>(null)

export const HudProvider = ({ children }: PropsWithChildren) => {
  const hudRef = useRef<Hud | null>(null)
  const listenersRef = useRef<Set<Listener>>(new Set())

  // Throttle notifications to avoid re-rendering DOM HUD at 60fps.
  const lastEmitAtRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const EMIT_INTERVAL_MS = 100

  const emit = useCallback(() => {
    lastEmitAtRef.current = performance.now()
    for (const l of listenersRef.current) l()
  }, [])

  const scheduleEmit = useCallback(() => {
    const now = performance.now()
    const dueIn = EMIT_INTERVAL_MS - (now - lastEmitAtRef.current)

    if (dueIn <= 0) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      emit()
      return
    }

    if (timerRef.current) return
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      emit()
    }, dueIn)
  }, [emit])

  const setHud = useCallback(
    (next: Hud | null) => {
      hudRef.current = next
      scheduleEmit()
    },
    [scheduleEmit],
  )

  const getHud = useCallback(() => hudRef.current, [])

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const value = useMemo<HudContextValue>(() => ({ getHud, setHud, subscribe }), [getHud, setHud, subscribe])

  return <HudContext.Provider value={value}>{children}</HudContext.Provider>
}

export function useHud(): Hud | null {
  const ctx = useContext(HudContext)
  if (!ctx) throw new Error('useHud must be used within HudProvider')
  return useSyncExternalStore(ctx.subscribe, ctx.getHud, ctx.getHud)
}

export function useHudActions() {
  const ctx = useContext(HudContext)
  if (!ctx) throw new Error('useHudActions must be used within HudProvider')
  return { setHud: ctx.setHud }
}


