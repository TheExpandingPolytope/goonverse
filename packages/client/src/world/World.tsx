import { useEffect, useRef } from 'react'
import { bootstrapRenderer } from './renderer'
import { attachInputListeners } from './input'

export const World = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const cleanupRenderer = bootstrapRenderer(canvas)
    const cleanupInput = attachInputListeners(canvas)

    return () => {
      cleanupInput()
      cleanupRenderer()
    }
  }, [])

  return (
    <div className="world">
      <canvas ref={canvasRef} className="world__canvas" />
    </div>
  )
}

