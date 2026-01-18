import type { WorldViewModel } from './adapters'
import { formatUsd } from '@/lib/formatter'
import {
  updateShake,
  getShakeOffset,
  updateShockwaves,
  drawShockwaves,
  updateParticles,
  drawParticles,
} from '@/lib/fx'

// ═══════════════════════════════════════════════════════════════════
// POC PARITY: Color Palette (matches poc/src/config.js COLORS)
// ═══════════════════════════════════════════════════════════════════
const POC_COLORS = {
  // Primary: Money/Player/Success
  primary: '#4ade80',
  primaryDark: '#22c55e',
  primaryGlow: 'rgba(74, 222, 128, 0.4)',
  // Danger: Enemies/Damage/Loss
  danger: '#fb7185',
  dangerDark: '#e11d48',
  dangerGlow: 'rgba(251, 113, 133, 0.4)',
  dangerOverlay: 'rgba(251, 113, 133, 0.12)',
  // Warning: Stun/Charging/Caution
  warning: '#fcd34d',
  warningDark: '#f59e0b',
  // Neutrals
  white: '#ffffff',
  gray: '#64748b',
  grayLight: '#94a3b8',
  grayDark: '#334155',
  // Background
  bg: '#0f0f14',
  bgLight: '#1a1a24',
  // Grid
  gridLine: '#252530',
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// Simple cached text renderer for performance
class UText {
  private _value = ''
  private _color = '#FFFFFF'
  private _stroke = true
  private _strokeColor = '#000000'
  private _size = 16
  private _scale = 1
  private _dirty = true
  private _canvas: HTMLCanvasElement | null = null
  private _ctx: CanvasRenderingContext2D | null = null

  constructor(size?: number, color?: string, stroke?: boolean, strokeColor?: string) {
    if (typeof size === 'number') this._size = size
    if (typeof color === 'string') this._color = color
    if (typeof stroke === 'boolean') this._stroke = stroke
    if (typeof strokeColor === 'string') this._strokeColor = strokeColor
  }

  setSize(size: number) {
    if (this._size !== size) {
      this._size = size
      this._dirty = true
    }
  }

  setScale(scale: number) {
    if (this._scale !== scale) {
      this._scale = scale
      this._dirty = true
    }
  }

  setValue(value: string) {
    if (this._value !== value) {
      this._value = value
      this._dirty = true
    }
  }

  render(): HTMLCanvasElement {
    if (!this._canvas) {
      this._canvas = document.createElement('canvas')
      this._ctx = this._canvas.getContext('2d')
    }
    const canvas = this._canvas
    const ctx = this._ctx
    if (!ctx) return canvas

    if (this._dirty) {
      this._dirty = false

      const value = this._value
      const scale = this._scale
      const fontsize = this._size
      const font = `700 ${fontsize}px Rubik, sans-serif`

      ctx.font = font
      const h = Math.trunc(0.2 * fontsize)
      const wd = fontsize * 0.1
      const h2 = h * 0.5

      canvas.width = ctx.measureText(value).width * scale + 8
      canvas.height = (fontsize + h) * scale + 4

      ctx.font = font
      ctx.globalAlpha = 1
      ctx.lineWidth = wd
      ctx.strokeStyle = this._strokeColor
      ctx.fillStyle = this._color

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.translate(2, 2)
      ctx.scale(scale, scale)

      if (this._stroke) ctx.strokeText(value, 0, fontsize - h2)
      ctx.fillText(value, 0, fontsize - h2)
    }

    return canvas
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, camX: number, camY: number, zoom: number) {
  // POC parity: Dark background
  ctx.fillStyle = POC_COLORS.bg
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.strokeStyle = POC_COLORS.gridLine
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.5
  ctx.scale(zoom, zoom)

  const w = width / zoom
  const h = height / zoom
  const sz = 100 // POC uses 100px grid

  // Vertical lines
  ctx.beginPath()
  for (let x = -0.5 + ((-camX + w / 2) % sz); x < w; x += sz) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
  }
  ctx.stroke()

  // Horizontal lines
  ctx.beginPath()
  for (let y = -0.5 + ((-camY + h / 2) % sz); y < h; y += sz) {
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
  }
  ctx.stroke()

  ctx.restore()
}

/**
 * POC parity: Draw circular border
 */
function drawCircularBorder(ctx: CanvasRenderingContext2D, borderRadius: number) {
  ctx.strokeStyle = POC_COLORS.danger
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(0, 0, borderRadius, 0, Math.PI * 2)
  ctx.stroke()
}

/**
 * POC parity: Draw out-of-bounds overlay (red tint beyond border)
 */
function drawOutOfBoundsOverlay(ctx: CanvasRenderingContext2D, borderRadius: number, maxRadius: number) {
  const br = borderRadius
  const maxR = maxRadius + 2000

  ctx.save()
  ctx.beginPath()
  ctx.rect(-maxR, -maxR, maxR * 2, maxR * 2)
  ctx.arc(0, 0, br, 0, Math.PI * 2, true)
  ctx.clip('evenodd')

  const g = ctx.createRadialGradient(0, 0, br, 0, 0, maxR)
  g.addColorStop(0, 'rgba(251, 113, 133, 0.00)')
  g.addColorStop(0.15, POC_COLORS.dangerOverlay)
  g.addColorStop(1, 'rgba(251, 113, 133, 0.22)')
  ctx.fillStyle = g
  ctx.fillRect(-maxR, -maxR, maxR * 2, maxR * 2)

  ctx.restore()
}

export type RendererOptions = {
  maxFps?: number
  getMaxFps?: () => number | null | undefined
  pauseWhenHidden?: boolean
}

export const bootstrapRenderer = (
  canvas: HTMLCanvasElement,
  getViewModel: () => WorldViewModel | null,
  options?: RendererOptions,
) => {
  const ctx = canvas.getContext('2d')

  let animationFrameId: number | null = null
  let timeoutId: number | null = null

  // Text caches
  const blobTextById = new Map<string, { name: UText; usd: UText }>()
  const pelletLabelByValue = new Map<string, UText>()
  const MONEY_COLOR = POC_COLORS.primary
  const MONEY_STROKE = 'rgba(0,0,0,0.9)'

  let lastFrameAt = performance.now()
  let lastDrawAt = lastFrameAt

  const scheduleNext = (delayMs: number = 0) => {
    if (timeoutId) {
      window.clearTimeout(timeoutId)
      timeoutId = null
    }

    if (delayMs > 0) {
      timeoutId = window.setTimeout(() => {
        animationFrameId = requestAnimationFrame(render)
      }, delayMs)
      return
    }

    animationFrameId = requestAnimationFrame(render)
  }

  const render = () => {
    if (!ctx) return

    const { width, height } = canvas
    const view = getViewModel()

    // Low-power mode while the page is hidden
    if (options?.pauseWhenHidden && typeof document !== 'undefined' && document.hidden) {
      drawGrid(ctx, width, height, 0, 0, 1)
      scheduleNext(250)
      return
    }

    // FPS cap
    const fpsCap = options?.getMaxFps?.() ?? options?.maxFps
    if (typeof fpsCap === 'number' && fpsCap > 0) {
      const now = performance.now()
      const interval = 1000 / fpsCap
      const dtSinceDraw = now - lastDrawAt
      if (dtSinceDraw < interval) {
        scheduleNext(interval - dtSinceDraw)
        return
      }
      lastDrawAt = now
    }

    if (!view) {
      drawGrid(ctx, width, height, 0, 0, 1)
      scheduleNext()
      return
    }

    const now = performance.now()
    const dt = now - lastFrameAt
    lastFrameAt = now

    // POC parity: Update FX systems
    updateShake(dt)
    updateShockwaves()
    updateParticles()

    const shakeOff = getShakeOffset()
    const camX = view.camera.x + shakeOff.x
    const camY = view.camera.y + shakeOff.y
    const zoom = view.camera.zoom

    drawGrid(ctx, width, height, camX, camY, zoom)

    // Build a unified, size-sorted node list
    type NodeKind = 'food' | 'ejected' | 'virus' | 'bullet' | 'player'

    type RenderNode =
      | {
          kind: 'food'
          id: string
          x: number
          y: number
          radius: number
          color: string
          usdValue: number
          locked?: boolean
          unlockPop?: number
        }
      | { kind: 'ejected'; id: string; x: number; y: number; radius: number; color: string }
      | { kind: 'virus'; id: string; x: number; y: number; radius: number; color: string }
      | { kind: 'bullet'; id: string; x: number; y: number; radius: number }
      | {
          kind: 'player'
          id: string
          x: number
          y: number
          radius: number
          color: string
          displayName: string
          usdValue: number
          isLocal: boolean
          isExiting: boolean
          exitProgress: number
          exitRadius: number
          vx: number
          vy: number
          aimX: number
          aimY: number
          dashChargeRatio: number
          shootChargeRatio: number
          dashCooldownTicks: number
          dashActiveTicks: number
          stunTicks: number
          slowTicks: number
          shootRecoveryTicks: number
          exitCombatTagTicks: number
          hitFlashTicks: number
        }

    const nodes: RenderNode[] = []

    // Add pellets
    for (const p of view.pellets) {
      nodes.push({
        kind: 'food',
        id: p.id,
        x: p.x,
        y: p.y,
        radius: p.radius,
        color: p.color,
        usdValue: p.usdValue,
        locked: p.locked,
        unlockPop: p.unlockPop,
      })
    }

    // Add ejected mass (spills)
    for (const m of view.ejectedMass) {
      nodes.push({ kind: 'ejected', id: m.id, x: m.x, y: m.y, radius: m.radius, color: m.color })
    }

    // Add obstacles (rendered as "virus" visually)
    for (const v of view.viruses) {
      nodes.push({ kind: 'virus', id: v.id, x: v.x, y: v.y, radius: v.radius, color: v.color })
    }

    // Add bullets
    for (const b of view.bullets) {
      nodes.push({ kind: 'bullet', id: b.id, x: b.x, y: b.y, radius: b.radius })
    }

    // Add other players
    for (const b of view.otherBlobs) {
      nodes.push({
        kind: 'player',
        id: b.id,
        x: b.x,
        y: b.y,
        radius: b.isExiting ? b.exitRadius : b.radius,
        color: b.color,
        displayName: b.displayName,
        usdValue: b.usdValue,
        isLocal: b.isLocal,
        isExiting: b.isExiting,
        exitProgress: b.exitProgress,
        exitRadius: b.exitRadius,
        vx: b.vx,
        vy: b.vy,
        aimX: b.aimX,
        aimY: b.aimY,
        dashChargeRatio: b.dashChargeRatio,
        shootChargeRatio: b.shootChargeRatio,
        dashCooldownTicks: b.dashCooldownTicks,
        dashActiveTicks: b.dashActiveTicks,
        stunTicks: b.stunTicks,
        slowTicks: b.slowTicks,
        shootRecoveryTicks: b.shootRecoveryTicks,
        exitCombatTagTicks: b.exitCombatTagTicks,
        hitFlashTicks: b.hitFlashTicks,
      })
    }

    // Add local player blobs
    for (const b of view.playerBlobs) {
      nodes.push({
        kind: 'player',
        id: b.id,
        x: b.x,
        y: b.y,
        radius: b.isExiting ? b.exitRadius : b.radius,
        color: b.color,
        displayName: b.displayName,
        usdValue: b.usdValue,
        isLocal: b.isLocal,
        isExiting: b.isExiting,
        exitProgress: b.exitProgress,
        exitRadius: b.exitRadius,
        vx: b.vx,
        vy: b.vy,
        aimX: b.aimX,
        aimY: b.aimY,
        dashChargeRatio: b.dashChargeRatio,
        shootChargeRatio: b.shootChargeRatio,
        dashCooldownTicks: b.dashCooldownTicks,
        dashActiveTicks: b.dashActiveTicks,
        stunTicks: b.stunTicks,
        slowTicks: b.slowTicks,
        shootRecoveryTicks: b.shootRecoveryTicks,
        exitCombatTagTicks: b.exitCombatTagTicks,
        hitFlashTicks: b.hitFlashTicks,
      })
    }

    // Sort by radius (smallest first, so bigger things draw on top)
    nodes.sort((a, b) => {
      if (a.radius !== b.radius) return a.radius - b.radius
      const an = Number(a.id)
      const bn = Number(b.id)
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

    // World transform
    ctx.save()
    ctx.translate(width / 2, height / 2)
    ctx.scale(zoom, zoom)
    ctx.translate(-camX, -camY)

    // POC parity: Draw circular border (behind entities)
    drawCircularBorder(ctx, view.border.radius)

    // POC parity: Draw shockwaves (behind entities)
    drawShockwaves(ctx)

    // POC parity: Draw particles (behind entities)
    drawParticles(ctx)

    const ratio = Math.ceil(10 * zoom) * 0.1
    const invRatio = 1 / ratio

    // ═══════════════════════════════════════════════════════════════════
    // POC PARITY: Render all entities as FLAT CIRCLES with BOLD OUTLINES
    // ═══════════════════════════════════════════════════════════════════
    for (const node of nodes) {
      let x = node.x
      let y = node.y
      const r = node.radius

      if (r <= 0) continue

      // ─────────────────────────────────────────────────────────────────
      // PLAYER rendering (POC style: flat circle + barrel + effects)
      // ─────────────────────────────────────────────────────────────────
      if (node.kind === 'player') {
        const speed = Math.hypot(node.vx, node.vy)

        // Dash / speed trails
        if (speed > 0.2) {
          const angle = Math.atan2(node.vy, node.vx)
          const trailSteps = Math.min(6, 3 + Math.floor(speed / 3))
          const baseLength = 18
          const velocityLength = speed * 5
          const trailLength = baseLength + velocityLength
          for (let i = 0; i < trailSteps; i++) {
            const t = (i + 1) / (trailSteps + 1)
            const dist = trailLength * t
            const tx = x - Math.cos(angle) * dist
            const ty = y - Math.sin(angle) * dist
            const speedFactor = Math.min(1, speed / 8)
            const trailAlpha = (1 - t) * (0.12 + speedFactor * 0.35)
            const trailRadius = r * (1 - t * 0.4)
            ctx.beginPath()
            ctx.arc(tx, ty, trailRadius, 0, Math.PI * 2)
            ctx.fillStyle = node.color
            ctx.globalAlpha = trailAlpha
            ctx.fill()
          }
          ctx.globalAlpha = 1
        }

        // Hit shake (local jitter)
        if (node.hitFlashTicks > 0) {
          const shakeIntensity = 4
          const t = now * 0.03 + Number(node.id) * 1000
          x += Math.sin(t * 7) * shakeIntensity
          y += Math.cos(t * 11) * shakeIntensity
        }

        // POC: Gun barrel (drawn BEHIND body, pointing toward aim)
        const aimAngle = Math.atan2(node.aimY - y, node.aimX - x)
        const barrelLength = r * 1.2
        const barrelWidth = Math.max(6, r * 0.4)
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(aimAngle)
        // Barrel (gray with dark outline)
        ctx.fillStyle = '#888'
        ctx.strokeStyle = '#555'
        ctx.lineWidth = 4
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.roundRect(r * 0.1, -barrelWidth / 2, barrelLength, barrelWidth, 4)
        ctx.fill()
        ctx.stroke()
        ctx.restore()

        // POC: Main body (flat circle with dark outline)
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = node.color
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'
        ctx.lineWidth = Math.max(4, r * 0.08)
        ctx.stroke()

        // Dash charging effect
        if (node.dashChargeRatio > 0 && node.dashActiveTicks <= 0) {
          const chargeRatio = clamp(node.dashChargeRatio, 0, 1)
          const pulseFreq = 8 + chargeRatio * 12
          const pulseAmp = 0.03 + chargeRatio * 0.05
          const pulse = 1 + Math.sin(now * 0.01 * pulseFreq) * pulseAmp
          const glowRadius = r * pulse + 4
          ctx.beginPath()
          ctx.arc(x, y, glowRadius, 0, Math.PI * 2)
          ctx.strokeStyle = chargeRatio > 0.8 ? POC_COLORS.danger : POC_COLORS.warning
          ctx.lineWidth = 3 + chargeRatio * 3
          ctx.globalAlpha = 0.4 + chargeRatio * 0.4
          ctx.stroke()
          ctx.globalAlpha = 1

          // Charge arc
          ctx.beginPath()
          ctx.arc(x, y, r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * chargeRatio)
          ctx.strokeStyle = chargeRatio > 0.9 ? POC_COLORS.danger : POC_COLORS.white
          ctx.lineWidth = 4 + chargeRatio * 2
          ctx.lineCap = 'round'
          ctx.stroke()
          ctx.lineCap = 'butt'
        }

        // Dash active effect (white ring)
        if (node.dashActiveTicks > 0) {
          ctx.beginPath()
          ctx.arc(x, y, r + 2, 0, Math.PI * 2)
          ctx.strokeStyle = POC_COLORS.white
          ctx.lineWidth = 3
          ctx.stroke()
        }

        // Shoot charge effect
        if (node.shootChargeRatio > 0) {
          const chargeRatio = clamp(node.shootChargeRatio, 0, 1)
          ctx.beginPath()
          ctx.arc(x, y, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * chargeRatio)
          ctx.strokeStyle = chargeRatio > 0.9 ? POC_COLORS.danger : POC_COLORS.primary
          ctx.lineWidth = 3 + chargeRatio * 2
          ctx.lineCap = 'round'
          ctx.stroke()
          ctx.lineCap = 'butt'
        }

        // Hit flash overlay
        if (node.hitFlashTicks > 0) {
          const flashAlpha = Math.min(0.6, node.hitFlashTicks / 10)
          ctx.fillStyle = POC_COLORS.danger
          ctx.globalAlpha = flashAlpha
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
        }

        // Slow tint
        if (node.slowTicks > 0) {
          const slowAlpha = Math.min(0.25, (node.slowTicks / 30) * 0.25)
          ctx.fillStyle = POC_COLORS.danger
          ctx.globalAlpha = slowAlpha
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
        }

        // POC: Stun visual (orbiting pips)
        if (node.stunTicks > 0) {
          const time = now * 0.005
          ctx.fillStyle = POC_COLORS.warning
          for (let i = 0; i < 3; i++) {
            const angle = time + (i * (Math.PI * 2)) / 3
            const sx = x + Math.cos(angle) * r * 1.3
            const sy = y + Math.sin(angle) * r * 1.3
            ctx.beginPath()
            ctx.arc(sx, sy, Math.max(3, r * 0.1), 0, Math.PI * 2)
            ctx.fill()
          }
        }

        // POC: Exit progress ring
        if (node.isExiting && node.exitProgress > 0) {
          const progress = clamp(node.exitProgress, 0, 1)
          // Background track
          ctx.strokeStyle = POC_COLORS.grayDark
          ctx.lineWidth = 4
          ctx.beginPath()
          ctx.arc(x, y, r + 10, 0, Math.PI * 2)
          ctx.stroke()
          // Progress arc
          ctx.strokeStyle = POC_COLORS.primary
          ctx.lineCap = 'round'
          ctx.lineWidth = 4
          ctx.beginPath()
          ctx.arc(x, y, r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
          ctx.stroke()
          ctx.lineCap = 'butt'
        }

        // Name label (centered on body)
        const nameSize = Math.max(Math.trunc(0.3 * r), 14)
        const cached = blobTextById.get(node.id) ?? {
          name: new UText(nameSize, '#FFFFFF', true, '#000000'),
          usd: new UText(nameSize * 0.6, MONEY_COLOR, true, MONEY_STROKE),
        }
        blobTextById.set(node.id, cached)

        cached.name.setValue(node.displayName)
        cached.name.setSize(nameSize)
        cached.name.setScale(ratio)

        const nameCanvas = cached.name.render()
        const nameW = Math.trunc(nameCanvas.width * invRatio)
        const nameH = Math.trunc(nameCanvas.height * invRatio)
        ctx.drawImage(nameCanvas, x - Math.trunc(nameW / 2), y - Math.trunc(nameH / 2), nameW, nameH)

        // USD value above entity
        if (r > 20 || node.isLocal) {
          const usdText = formatUsd(node.usdValue, true)
          cached.usd.setValue(usdText)
          cached.usd.setSize(nameSize * 0.6)
          cached.usd.setScale(ratio)

          const usdCanvas = cached.usd.render()
          const usdW = Math.trunc(usdCanvas.width * invRatio)
          const usdH = Math.trunc(usdCanvas.height * invRatio)

          ctx.drawImage(usdCanvas, x - Math.trunc(usdW / 2), y - r - usdH - 8, usdW, usdH)
        }

        continue
      }

      // ─────────────────────────────────────────────────────────────────
      // FOOD (pellet) rendering - POC style: flat green circle + outline
      // ─────────────────────────────────────────────────────────────────
      if (node.kind === 'food') {
        const popScale = node.unlockPop ? 1 + node.unlockPop * 0.4 : 1
        const lockedAlpha = node.locked ? 0.4 : 1
        ctx.globalAlpha = lockedAlpha

        // Flat circle
        ctx.beginPath()
        ctx.arc(x, y, r * popScale, 0, Math.PI * 2)
        ctx.fillStyle = node.color
        ctx.fill()
        ctx.strokeStyle = '#222'
        ctx.lineWidth = 2
        ctx.stroke()

        // USD label above pellet
        const label = Number.isFinite(node.usdValue) ? formatUsd(node.usdValue, true) : null
        if (label && r >= 4) {
          let text = pelletLabelByValue.get(label)
          if (!text) {
            text = new UText(14, MONEY_COLOR, true, MONEY_STROKE)
            text.setValue(label)
            pelletLabelByValue.set(label, text)
          }
          text.setScale(ratio)
          const c = text.render()
          const w = Math.trunc(c.width * invRatio)
          const h = Math.trunc(c.height * invRatio)
          ctx.drawImage(c, x - Math.trunc(w / 2), y - r * popScale - h - 4, w, h)
        }
        ctx.globalAlpha = 1
        continue
      }

      // ─────────────────────────────────────────────────────────────────
      // EJECTED MASS (spill) rendering - POC style: flat green circle
      // ─────────────────────────────────────────────────────────────────
      if (node.kind === 'ejected') {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = node.color
        ctx.fill()
        ctx.strokeStyle = '#222'
        ctx.lineWidth = 2
        ctx.stroke()
        continue
      }

      // ─────────────────────────────────────────────────────────────────
      // OBSTACLE (virus) rendering - POC style: dark gray with outline
      // ─────────────────────────────────────────────────────────────────
      if (node.kind === 'virus') {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(55,65,81,0.9)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'
        ctx.lineWidth = Math.max(3, r * 0.08)
        ctx.stroke()
        continue
      }

      // ─────────────────────────────────────────────────────────────────
      // BULLET rendering - POC style: gold circle with dark outline
      // ─────────────────────────────────────────────────────────────────
      if (node.kind === 'bullet') {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = POC_COLORS.warning
        ctx.fill()
        ctx.strokeStyle = '#222'
        ctx.lineWidth = 2
        ctx.stroke()
        continue
      }
    }

    // POC parity: Draw out-of-bounds overlay (tints everything beyond border)
    drawOutOfBoundsOverlay(ctx, view.border.radius, view.border.maxRadius)

    ctx.restore()

    scheduleNext()
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
    if (timeoutId) window.clearTimeout(timeoutId)
    window.removeEventListener('resize', handleResize)
  }
}
