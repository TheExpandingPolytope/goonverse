import { useEffect, useMemo, useRef } from 'react'
import type { WorldViewModel } from './adapters'
import { bootstrapRenderer } from './renderer'
import { attachInputListeners } from './input'
import { createDeltaWorldAdapter } from './adapters'
import { createMockViewModelSource } from './mock'
import { useGameClientContext } from '@/hooks/useGameSession'
import { useHudActions } from '@/hooks/useHud'
import { useEthUsdPrice } from '@/hooks/useEthUsdPrice'
import { useUI } from '@/hooks/useUI'

export const World = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { room, sessionId, getStateSnapshot, sendInput, phase } = useGameClientContext()
  const { ethUsd } = useEthUsdPrice()
  const { isOverlayVisible } = useUI()
  const { setHud } = useHudActions()

  const mockGetViewModel = useMemo(() => createMockViewModelSource(), [])

  // Keep the renderer wired up once; swap the view model source via refs.
  const getViewModelRef = useRef<() => WorldViewModel | null>(() => null)
  const getMaxFpsRef = useRef<() => number | null>(() => null)

  const adapter = useMemo(() => {
    if (!room) return null

    return createDeltaWorldAdapter({
      // getStateSnapshot will return the latest Colyseus GameState proxy
      // (or null if not yet available).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getStateSnapshot: getStateSnapshot as () => any | null,
      sendInput,
      sessionId,
      ethUsd,
    })
  }, [room, getStateSnapshot, sendInput, sessionId, ethUsd])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const cleanupRenderer = bootstrapRenderer(
      canvas,
      () => getViewModelRef.current(),
      {
        pauseWhenHidden: true,
        getMaxFps: () => getMaxFpsRef.current(),
      },
    )

    return () => {
      cleanupRenderer()
    }
  }, [])

  useEffect(() => {
    // Low power while overlay is shown.
    getMaxFpsRef.current = () => (isOverlayVisible ? 24 : null)
  }, [isOverlayVisible])

  useEffect(() => {
    getViewModelRef.current = () => {
      if (isOverlayVisible) {
        setHud(null)
        return mockGetViewModel()
      }
      if (!adapter) {
        setHud(null)
        return null
      }
      const vm = adapter.getViewModel()
      setHud(vm?.hud ?? null)
      return vm
    }
  }, [isOverlayVisible, mockGetViewModel, adapter, setHud])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !adapter || isOverlayVisible) return

    const cleanupInput = attachInputListeners(canvas, adapter.controller)
    return () => {
      cleanupInput()
    }
  }, [adapter, isOverlayVisible])

  return (
    <div className={`absolute inset-0 ${isOverlayVisible ? 'pointer-events-none' : ''}`} data-phase={phase}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  )
}
