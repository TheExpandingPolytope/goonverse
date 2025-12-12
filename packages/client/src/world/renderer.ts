import type { WorldViewModel } from './adapters'

export const bootstrapRenderer = (
  canvas: HTMLCanvasElement,
  getViewModel: () => WorldViewModel | null,
) => {
  const context = canvas.getContext('2d')

  let animationFrameId: number | null = null

  const render = () => {
    if (!context) return

    const { width, height } = canvas
    context.clearRect(0, 0, width, height)

    // Background
    context.fillStyle = 'rgba(15, 23, 42, 1)' // slate-900
    context.fillRect(0, 0, width, height)

    const view = getViewModel()

    if (!view) {
      // Before joining a room we only have screen-space; draw a subtle grid.
      context.strokeStyle = 'rgba(148, 163, 184, 0.15)'
      context.lineWidth = 1
      const gridSize = 64
      for (let x = 0; x < width; x += gridSize) {
        context.beginPath()
        context.moveTo(x, 0)
        context.lineTo(x, height)
        context.stroke()
      }
      for (let y = 0; y < height; y += gridSize) {
        context.beginPath()
        context.moveTo(0, y)
        context.lineTo(width, y)
        context.stroke()
      }

      animationFrameId = requestAnimationFrame(render)
      return
    }

    // Compute world -> screen transform based on camera
    const scale = view.camera.zoom
    const halfW = width / 2
    const halfH = height / 2

    const toScreen = (x: number, y: number) => {
      const sx = (x - view.camera.x) * scale + halfW
      const sy = (y - view.camera.y) * scale + halfH
      return { x: sx, y: sy }
    }

    // World-space grid (moves with camera). This makes movement visible even
    // when the camera follows the local player.
    {
      const minor = 200
      const major = 1000

      const worldLeft = view.camera.x - halfW / scale
      const worldRight = view.camera.x + halfW / scale
      const worldTop = view.camera.y - halfH / scale
      const worldBottom = view.camera.y + halfH / scale

      const drawGrid = (step: number, alpha: number) => {
        context.strokeStyle = `rgba(148, 163, 184, ${alpha})`
        context.lineWidth = 1

        const startX = Math.floor(worldLeft / step) * step
        const endX = Math.ceil(worldRight / step) * step
        for (let x = startX; x <= endX; x += step) {
          const a = toScreen(x, worldTop)
          const b = toScreen(x, worldBottom)
          context.beginPath()
          context.moveTo(a.x, a.y)
          context.lineTo(b.x, b.y)
          context.stroke()
        }

        const startY = Math.floor(worldTop / step) * step
        const endY = Math.ceil(worldBottom / step) * step
        for (let y = startY; y <= endY; y += step) {
          const a = toScreen(worldLeft, y)
          const b = toScreen(worldRight, y)
          context.beginPath()
          context.moveTo(a.x, a.y)
          context.lineTo(b.x, b.y)
          context.stroke()
        }
      }

      drawGrid(minor, 0.06)
      drawGrid(major, 0.12)
    }

    // World bounds
    {
      const tl = toScreen(0, 0)
      const br = toScreen(view.world.width, view.world.height)
      context.strokeStyle = 'rgba(248, 250, 252, 0.35)'
      context.lineWidth = 2
      context.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y)
    }

    // Draw pellets
    context.fillStyle = '#22c55e'
    for (const pellet of view.pellets) {
      const { x, y } = toScreen(pellet.x, pellet.y)
      const r = pellet.radius * scale
      context.beginPath()
      context.arc(x, y, r, 0, Math.PI * 2)
      context.fill()
    }

    // Draw ejected mass
    for (const mass of view.ejectedMass) {
      const { x, y } = toScreen(mass.x, mass.y)
      const r = mass.radius * scale
      context.beginPath()
      context.arc(x, y, r, 0, Math.PI * 2)
      context.fillStyle = mass.color
      context.fill()
    }

    // Draw other players first
    for (const blob of view.otherBlobs) {
      const { x, y } = toScreen(blob.x, blob.y)
      const r = blob.radius * scale
      context.beginPath()
      context.arc(x, y, r, 0, Math.PI * 2)
      context.fillStyle = blob.color
      context.fill()
    }

    // Draw local player blobs on top
    for (const blob of view.playerBlobs) {
      const { x, y } = toScreen(blob.x, blob.y)
      const r = (blob.isExiting ? blob.exitRadius : blob.radius) * scale
      context.beginPath()
      context.arc(x, y, r, 0, Math.PI * 2)
      context.fillStyle = blob.color
      context.fill()

      if (blob.isExiting && view.hud.exitHoldProgress > 0) {
        // Outline to highlight exiting state
        context.strokeStyle = 'rgba(248, 250, 252, 0.9)'
        context.lineWidth = 3
        context.stroke()
      }
    }

    // HUD: simple text in the corner
    context.fillStyle = '#e5e7eb'
    context.font = '14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    context.textAlign = 'left'
    context.textBaseline = 'top'

    const lines: string[] = []
    lines.push(`Mass: ${Math.floor(view.hud.currentMass)}`)
    if (view.hud.exitHoldProgress > 0) {
      lines.push(`Exit: ${(view.hud.exitHoldProgress * 100).toFixed(0)}%`)
    }

    let y = 12
    for (const line of lines) {
      context.fillText(line, 12, y)
      y += 18
    }

    animationFrameId = requestAnimationFrame(render)
  }

  const handleResize = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }

  handleResize()
  window.addEventListener('resize', handleResize)
  render()

  return () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId)
    window.removeEventListener('resize', handleResize)
  }
}
