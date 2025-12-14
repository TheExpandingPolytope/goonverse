import type { WorldViewModel } from './adapters'
import { formatUsd } from '@/lib/formatter'

function darkerHslColor(hsl: string, lightnessDelta: number = 18): string {
  // Expected: hsl(H, S%, L%)
  const match = /hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/i.exec(hsl)
  if (!match) return 'rgba(0,0,0,0.35)'
  const h = Number(match[1])
  const s = Number(match[2])
  const l = Number(match[3])
  const nextL = Math.max(0, Math.min(100, l - lightnessDelta))
  return `hsl(${h}, ${s}%, ${nextL}%)`
}

function drawCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts?: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    font?: string
  },
) {
  if (opts?.font) ctx.font = opts.font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const fill = opts?.fill ?? '#f8fafc'
  const stroke = opts?.stroke ?? 'rgba(2, 6, 23, 0.9)'
  const strokeWidth = opts?.strokeWidth ?? 4
  ctx.lineWidth = strokeWidth
  ctx.strokeStyle = stroke
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

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
    for (const pellet of view.pellets) {
      const { x, y } = toScreen(pellet.x, pellet.y)
      const r = pellet.radius * scale
      context.beginPath()
      context.arc(x, y, r, 0, Math.PI * 2)
      context.fillStyle = pellet.color
      context.fill()

      // Outline
      context.strokeStyle = darkerHslColor(pellet.color, 22)
      context.lineWidth = Math.max(1, 2 * scale)
      context.stroke()

      // USD label (above pellet)
      if (r >= 4) {
        const label = formatUsd(pellet.usdValue, true)
        drawCenteredText(context, label, x, y - r - 10, {
          font: `${Math.max(10, 11 * scale)}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`,
          strokeWidth: Math.max(3, 4 * scale),
        })
      }
    }

    // Draw viruses
    for (const virus of view.viruses) {
      const { x, y } = toScreen(virus.x, virus.y)
      const r = virus.radius * scale
      const spikes = 14
      const outer = r * 1.15
      const inner = r * 0.85

      context.beginPath()
      for (let i = 0; i < spikes * 2; i++) {
        const angle = (i * Math.PI) / spikes
        const rad = i % 2 === 0 ? outer : inner
        const px = x + Math.cos(angle) * rad
        const py = y + Math.sin(angle) * rad
        if (i === 0) context.moveTo(px, py)
        else context.lineTo(px, py)
      }
      context.closePath()
      context.fillStyle = virus.color
      context.fill()

      context.strokeStyle = darkerHslColor(virus.color, 18)
      context.lineWidth = Math.max(2, 3 * scale)
      context.stroke()
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

      // Outline
      context.strokeStyle = darkerHslColor(blob.color, 18)
      context.lineWidth = Math.max(2, 3 * scale)
      context.stroke()

      // Labels (name + USD)
      if (r >= 10) {
        const name = blob.displayName
        const value = formatUsd(blob.usdValue, true)
        drawCenteredText(context, name, x, y - r - 18, {
          font: `${Math.max(11, 12 * scale)}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`,
          strokeWidth: Math.max(3, 4 * scale),
        })
        drawCenteredText(context, value, x, y - r - 4, {
          font: `${Math.max(10, 11 * scale)}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`,
          fill: '#e2e8f0',
          strokeWidth: Math.max(3, 4 * scale),
        })
      }
    }

    // Draw local player blobs on top
    for (const blob of view.playerBlobs) {
      const { x, y } = toScreen(blob.x, blob.y)
      const r = (blob.isExiting ? blob.exitRadius : blob.radius) * scale
      context.beginPath()
      context.arc(x, y, r, 0, Math.PI * 2)
      context.fillStyle = blob.color
      context.fill()

      // Outline
      context.strokeStyle =
        blob.isExiting && view.hud.exitHoldProgress > 0 ? 'rgba(248, 250, 252, 0.9)' : darkerHslColor(blob.color, 18)
      context.lineWidth = Math.max(2, 3 * scale)
      context.stroke()

      // Labels (name + USD)
      if (r >= 10) {
        const name = blob.displayName
        const value = formatUsd(blob.usdValue, true)
        drawCenteredText(context, name, x, y - r - 18, {
          font: `${Math.max(11, 12 * scale)}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`,
          strokeWidth: Math.max(3, 4 * scale),
        })
        drawCenteredText(context, value, x, y - r - 4, {
          font: `${Math.max(10, 11 * scale)}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`,
          fill: '#e2e8f0',
          strokeWidth: Math.max(3, 4 * scale),
        })
      }

      // Exit ring around local blob (progress)
      if (blob.isExiting && view.hud.exitHoldProgress > 0) {
        const progress = Math.max(0, Math.min(1, view.hud.exitHoldProgress))
        context.beginPath()
        context.strokeStyle = 'rgba(248, 250, 252, 0.9)'
        context.lineWidth = Math.max(2, 4 * scale)
        context.arc(x, y, r + 10 * scale, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
        context.stroke()
      }
    }

    // HUD: top-left debug text + bottom-center local worth + leaderboard
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

    // Bottom-center local worth
    {
      const text = formatUsd(view.hud.localUsdWorth, true)
      context.font = '18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      drawCenteredText(context, text, width / 2, height - 44, {
        font: '18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        strokeWidth: 5,
      })
    }

    // Leaderboard (top-right)
    {
      const entries = view.hud.leaderboard
      const maxRows = Math.min(entries.length, 12)
      const panelW = 240
      const panelX = width - panelW - 18
      const panelY = 72
      const rowH = 18
      const panelH = 28 + maxRows * rowH + 12

      context.fillStyle = 'rgba(0, 0, 0, 0.35)'
      context.strokeStyle = 'rgba(255,255,255,0.10)'
      context.lineWidth = 1
      context.beginPath()
      context.roundRect(panelX, panelY, panelW, panelH, 14)
      context.fill()
      context.stroke()

      context.textAlign = 'left'
      context.textBaseline = 'top'
      context.font = '12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      context.fillStyle = '#f8fafc'
      context.fillText('Leaderboard', panelX + 12, panelY + 10)

      for (let i = 0; i < maxRows; i++) {
        const e = entries[i]
        const yRow = panelY + 28 + i * rowH
        context.fillStyle = e.isLocal ? 'rgba(158, 252, 255, 0.95)' : 'rgba(248,250,252,0.9)'
        const name = e.displayName.length > 16 ? `${e.displayName.slice(0, 15)}…` : e.displayName
        context.fillText(`${i + 1}. ${name}`, panelX + 12, yRow)
        context.textAlign = 'right'
        context.fillText(formatUsd(e.usdValue, true), panelX + panelW - 12, yRow)
        context.textAlign = 'left'
      }
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
