import { useEffect, useMemo, useRef } from 'react'
import { bootstrapRenderer } from './renderer'
import { attachInputListeners } from './input'
import { createDeltaWorldAdapter } from './adapters'
import { useGameClientContext } from '@/hooks/useGameSession'
import { useEthUsdPrice } from '@/hooks/useEthUsdPrice'

export const World = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { room, sessionId, getStateSnapshot, sendInput, phase } = useGameClientContext()
  const { ethUsd } = useEthUsdPrice()

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
    if (!canvas || !adapter) return

    const cleanupRenderer = bootstrapRenderer(canvas, adapter.getViewModel)
    const cleanupInput = attachInputListeners(canvas, adapter.controller)

    return () => {
      cleanupInput()
      cleanupRenderer()
    }
  }, [adapter])

  return (
    <div className={`world world--phase-${phase}`}>
      <canvas ref={canvasRef} className="world__canvas" />
    </div>
  )
}
