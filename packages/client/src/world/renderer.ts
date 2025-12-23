import type { WorldViewModel } from './adapters'
import { formatUsd } from '@/lib/formatter'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

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
      const font = `${fontsize}px Ubuntu`

      ctx.font = font

      const h = Math.trunc(0.2 * fontsize)
      const wd = fontsize * 0.1
      const h2 = h * 0.5

      canvas.width = ctx.measureText(value).width * scale + 3
      canvas.height = (fontsize + h) * scale

      // Setting canvas size resets the state.
      ctx.font = font
      ctx.globalAlpha = 1
      ctx.lineWidth = wd
      ctx.strokeStyle = this._strokeColor
      ctx.fillStyle = this._color

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(scale, scale)
      if (this._stroke) ctx.strokeText(value, 0, fontsize - h2)
      ctx.fillText(value, 0, fontsize - h2)
    }

    return canvas
  }
}

type JellyPoint = { x: number; y: number; size: number }

type JellyState = {
  points: JellyPoint[]
  pointsAcc: number[]
  wasSimpleDrawing: boolean
}

function getJellyState(map: Map<string, JellyState>, id: string): JellyState {
  const existing = map.get(id)
  if (existing) return existing
  const next: JellyState = { points: [], pointsAcc: [], wasSimpleDrawing: true }
  map.set(id, next)
  return next
}

function getNumPoints(opts: { radius: number; isVirus: boolean; zoom: number; quality: number }): number {
  const { radius, isVirus, zoom, quality } = opts

  if (radius <= 0) return 0

  let minPoints = 10
  if (radius < 20) minPoints = 0
  if (isVirus) minPoints = 30

  let v = radius
  if (!isVirus) v *= zoom
  v *= quality

  const pts = Math.trunc(Math.max(v, minPoints))
  return clamp(pts, 0, 200)
}

function createPoints(state: JellyState, desired: number, x: number, y: number, radius: number) {
  while (state.points.length > desired) {
    const idx = Math.trunc(Math.random() * state.points.length)
    state.points.splice(idx, 1)
    state.pointsAcc.splice(idx, 1)
  }

  if (state.points.length === 0 && desired > 0) {
    state.points.push({ x, y, size: radius })
    state.pointsAcc.push(Math.random() - 0.5)
  }

  while (state.points.length < desired) {
    const rand2 = Math.trunc(Math.random() * state.points.length)
    const point = state.points[rand2]
    state.points.splice(rand2, 0, { x: point.x, y: point.y, size: point.size })
    state.pointsAcc.splice(rand2, 0, state.pointsAcc[rand2])
  }
}

function movePoints(opts: {
  state: JellyState
  x: number
  y: number
  radius: number
  isVirus: boolean
  zoom: number
  quality: number
  timestampMs: number
  idNum: number
}) {
  const { state, x, y, radius, isVirus, zoom, quality, timestampMs, idNum } = opts
  const desired = getNumPoints({ radius, isVirus, zoom, quality })
  createPoints(state, desired, x, y, radius)

  const points = state.points
  const acc = state.pointsAcc
  const n = points.length
  if (n === 0) return

  for (let i = 0; i < n; i++) {
    const prev = acc[(i - 1 + n) % n]
    const next = acc[(i + 1) % n]
    acc[i] += (Math.random() - 0.5) * 1
    acc[i] *= 0.7
    if (acc[i] > 10) acc[i] = 10
    if (acc[i] < -10) acc[i] = -10
    acc[i] = (prev + next + 8 * acc[i]) / 10
  }

  const rot = isVirus ? 0 : ((idNum / 1000 + timestampMs / 1e4) % (2 * Math.PI))

  for (let j = 0; j < n; j++) {
    let f = points[j].size
    const e = points[(j - 1 + n) % n].size
    const m = points[(j + 1) % n].size

    f += acc[j]
    if (f < 0) f = 0
    f = (12 * f + radius) / 13
    points[j].size = (e + m + 8 * f) / 10

    const angle = (2 * Math.PI) / n
    let rr = points[j].size
    if (isVirus && j % 2 === 0) rr += 5

    points[j].x = x + Math.cos(angle * j + rot) * rr
    points[j].y = y + Math.sin(angle * j + rot) * rr
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, camX: number, camY: number, zoom: number) {
  // Dark-mode default (always-on): match the app's deep dark background.
  ctx.fillStyle = '#05050a'
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.strokeStyle = '#ffffff'
  ctx.globalAlpha = 0.06
  ctx.scale(zoom, zoom)

  const w = width / zoom
  const h = height / zoom

  // Vertical lines
  ctx.beginPath()
  for (let x = -0.5 + ((-camX + w / 2) % 50); x < w; x += 50) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
  }
  ctx.stroke()

  // Horizontal lines
  ctx.beginPath()
  for (let y = -0.5 + ((-camY + h / 2) % 50); y < h; y += 50) {
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
  }
  ctx.stroke()

  ctx.restore()
}

export type RendererOptions = {
  /**
   * If provided, render will be throttled to at most this FPS.
   * Prefer `getMaxFps` when the cap needs to change dynamically.
   */
  maxFps?: number
  /**
   * Dynamic FPS cap. Return a number to cap, or null/undefined for uncapped.
   * Called from the render loop.
   */
  getMaxFps?: () => number | null | undefined
  /**
   * If true, the renderer will reduce work while the tab is hidden.
   */
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

  // Render caches / state
  const jellyById = new Map<string, JellyState>()
  const blobTextById = new Map<string, { name: UText; usd: UText }>()
  const pelletLabelByValue = new Map<string, UText>()
  const bottomWorthText = new UText(28, '#FFFFFF', true, '#000000')

  // Simple skin support (optional; expects /skinList.txt and /skins/<name>.png)
  let knownSkins: Set<string> | null = null
  let triedSkinList = false
  const skins = new Map<string, HTMLImageElement>()

  const ensureSkinList = () => {
    if (triedSkinList) return
    triedSkinList = true

    fetch('/skinList.txt')
      .then((resp) => {
        if (!resp.ok) throw new Error('skinList.txt not found')
        return resp.text()
      })
      .then((text) => {
        const names = text.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
        knownSkins = new Set(names)
      })
      .catch(() => {
        knownSkins = new Set()
      })
  }

  const getSkinImage = (skinName: string): HTMLImageElement | null => {
    if (!knownSkins || !knownSkins.has(skinName)) return null

    const cached = skins.get(skinName)
    if (cached) {
      if (cached.complete && cached.naturalWidth > 0) return cached
      return null
    }

    const img = new Image()
    img.src = `/skins/${skinName}.png`
    skins.set(skinName, img)
    return null
  }

  // Adaptive jelly quality (Ogar-style)
  let quality = 1
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

    ensureSkinList()

    const { width, height } = canvas
    const view = getViewModel()

    // Low-power mode while the page is hidden (background tab).
    if (options?.pauseWhenHidden && typeof document !== 'undefined' && document.hidden) {
      drawGrid(ctx, width, height, 0, 0, 1)
      scheduleNext(250)
      return
    }

    // FPS cap (used for low-power "mock mode" behind overlay).
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
      // Basic empty-state: light background + grid.
      drawGrid(ctx, width, height, 0, 0, 1)
      scheduleNext()
      return
    }

    const now = performance.now()
    const dt = now - lastFrameAt
    lastFrameAt = now

    // Ogar quality adaptation
    if (dt > 1000 / 60) quality -= 0.01
    else if (dt < 1000 / 65) quality += 0.01
    quality = clamp(quality, 0.4, 1)

    const camX = view.camera.x
    const camY = view.camera.y
    const zoom = view.camera.zoom

    drawGrid(ctx, width, height, camX, camY, zoom)

    // Build a unified, size-sorted node list (Ogar-style)
    const nodes: Array<
      | { kind: 'food'; id: string; x: number; y: number; radius: number; color: string; usdValue: number }
      | { kind: 'ejected'; id: string; x: number; y: number; radius: number; color: string }
      | { kind: 'virus'; id: string; x: number; y: number; radius: number; color: string }
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
        }
    > = []

    for (const p of view.pellets) {
      nodes.push({ kind: 'food', id: p.id, x: p.x, y: p.y, radius: p.radius, color: p.color, usdValue: p.usdValue })
    }
    for (const m of view.ejectedMass) {
      nodes.push({ kind: 'ejected', id: m.id, x: m.x, y: m.y, radius: m.radius, color: m.color })
    }
    for (const v of view.viruses) {
      nodes.push({ kind: 'virus', id: v.id, x: v.x, y: v.y, radius: v.radius, color: v.color })
    }
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
      })
    }
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
      })
    }

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

    const ratio = Math.ceil(10 * zoom) * 0.1
    const invRatio = 1 / ratio

    for (const node of nodes) {
      const x = node.x
      const y = node.y
      const r = node.radius

      if (r <= 0) continue

      if (node.kind === 'food') {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = node.color
        ctx.fill()

        // USD label above pellet
        const label = formatUsd(node.usdValue, true)
        if (r >= 4) {
          let text = pelletLabelByValue.get(label)
          if (!text) {
            text = new UText(14, '#FFFFFF', true, '#000000')
            text.setValue(label)
            pelletLabelByValue.set(label, text)
          }
          text.setScale(ratio)
          const c = text.render()
          const w = Math.trunc(c.width * invRatio)
          const h = Math.trunc(c.height * invRatio)
          ctx.drawImage(c, x - Math.trunc(w / 2), y - r - 10, w, h)
        }
        continue
      }

      if (node.kind === 'ejected') {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = node.color
        ctx.fill()
        continue
      }

      const isVirus = node.kind === 'virus'

      // Jelly / spiky rendering for player + virus
      const state = getJellyState(jellyById, node.id)
      const desired = getNumPoints({ radius: r, isVirus, zoom, quality })

      let simple = !isVirus && zoom < 0.4
      if (desired < 10) simple = true

      // If we were simple and now want jelly (or vice versa), reset point sizes.
      if (state.wasSimpleDrawing && !simple) {
        for (const p of state.points) p.size = r
      }
      state.wasSimpleDrawing = simple

      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineJoin = isVirus ? 'miter' : 'round'
      ctx.fillStyle = node.color
      ctx.strokeStyle = node.color

      let bigPointSize = r

      if (simple) {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, 2 * Math.PI, false)
        ctx.closePath()
        ctx.fill()
      } else {
        movePoints({
          state,
          x,
          y,
          radius: r,
          isVirus,
          zoom,
          quality,
          timestampMs: now,
          idNum: Number(node.id) || 0,
        })

        bigPointSize = r
        for (const p of state.points) bigPointSize = Math.max(p.size, bigPointSize)

        const d = Math.max(1, Math.min(state.points.length, desired))

        ctx.beginPath()
        ctx.moveTo(state.points[0].x, state.points[0].y)
        for (let i = 1; i <= d; i++) {
          const e = i % d
          ctx.lineTo(state.points[e].x, state.points[e].y)
        }
        ctx.closePath()

        ctx.fill()

        // Subtle outline
        ctx.globalAlpha *= 0.1
        ctx.strokeStyle = '#000000'
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Skin rendering for player cells only
      if (node.kind === 'player') {
        const skinName = node.displayName.trim().toLowerCase()
        const img = skinName ? getSkinImage(skinName) : null
        if (img) {
          ctx.save()
          ctx.clip()
          ctx.drawImage(img, x - bigPointSize, y - bigPointSize, 2 * bigPointSize, 2 * bigPointSize)
          ctx.restore()
        }

        // Centered name + USD (Ogar-style)
        const nameSize = Math.max(Math.trunc(0.3 * r), 24)
        const cached = blobTextById.get(node.id) ?? {
          name: new UText(nameSize, '#FFFFFF', true, '#000000'),
          usd: new UText(nameSize * 0.5, '#FFFFFF', true, '#000000'),
        }
        blobTextById.set(node.id, cached)

        cached.name.setValue(node.displayName)
        cached.name.setSize(nameSize)
        cached.name.setScale(ratio)

        const nameCanvas = cached.name.render()
        const nameW = Math.trunc(nameCanvas.width * invRatio)
        const nameH = Math.trunc(nameCanvas.height * invRatio)
        ctx.drawImage(nameCanvas, x - Math.trunc(nameW / 2), y - Math.trunc(nameH / 2), nameW, nameH)

        // USD (mass-like) below the name
        if (r > 20 || node.isLocal) {
          const usdText = formatUsd(node.usdValue, true)
          cached.usd.setValue(usdText)
          cached.usd.setSize(nameSize * 0.5)
          cached.usd.setScale(ratio)

          const usdCanvas = cached.usd.render()
          const usdW = Math.trunc(usdCanvas.width * invRatio)
          const usdH = Math.trunc(usdCanvas.height * invRatio)

          const yUsd = node.displayName ? y + Math.trunc(usdH * 0.7) : y - Math.trunc(usdH * 0.5)
          ctx.drawImage(usdCanvas, x - Math.trunc(usdW / 2), yUsd, usdW, usdH)
        }

        // Exit ring (economic overlay)
        if (node.isLocal && view.hud.exitHoldProgress > 0) {
          const progress = clamp(view.hud.exitHoldProgress, 0, 1)
          ctx.beginPath()
          ctx.strokeStyle = 'rgba(0,0,0,0.85)'
          ctx.lineWidth = 4 / zoom
          ctx.arc(x, y, r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
          ctx.stroke()
        }
      }

      ctx.restore()
    }

    ctx.restore()

    // HUD (screen-space)
    if (view.hud.showTopLeftStats !== false) {
      const scoreText = `Mass: ${Math.floor(view.hud.currentMass)}`
      const exitText = view.hud.exitHoldProgress > 0 ? `Exit: ${(view.hud.exitHoldProgress * 100).toFixed(0)}%` : null

      ctx.save()
      ctx.globalAlpha = 0.2
      ctx.fillStyle = '#000000'
      ctx.fillRect(10, 10, 220, exitText ? 58 : 34)
      ctx.restore()

      ctx.fillStyle = '#FFFFFF'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.font = '18px Ubuntu'
      ctx.fillText(scoreText, 16, 16)
      if (exitText) {
        ctx.font = '16px Ubuntu'
        ctx.fillText(exitText, 16, 38)
      }
    }

    // Bottom-center local worth
    if (view.hud.showBottomWorth !== false) {
      const text = formatUsd(view.hud.localUsdWorth, true)
      bottomWorthText.setValue(text)
      bottomWorthText.setScale(1)
      const c = bottomWorthText.render()
      const w = c.width
      const h = c.height
      ctx.drawImage(c, width / 2 - w / 2, height - 56, w, h)
    }

    // Leaderboard (top-right) — keep our existing panel
    if (view.hud.showLeaderboard !== false) {
      const entries = view.hud.leaderboard
      const maxRows = Math.min(entries.length, 12)
      const minRows = 10
      const panelW = 240
      const panelX = width - panelW - 18
      const panelY = 72
      const rowH = 18
      const rowsForPanel = Math.max(maxRows, minRows)
      const panelH = 28 + rowsForPanel * rowH + 12

      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(panelX, panelY, panelW, panelH, 14)
      ctx.fill()
      ctx.stroke()

      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.font = '12px Ubuntu'
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText('Leaderboard', panelX + 12, panelY + 10)

      for (let i = 0; i < maxRows; i++) {
        const e = entries[i]
        const yRow = panelY + 28 + i * rowH
        ctx.fillStyle = e.isLocal ? 'rgba(255,170,170,0.95)' : 'rgba(255,255,255,0.9)'
        ctx.font = '12px Ubuntu'
        const name = e.displayName.length > 16 ? `${e.displayName.slice(0, 15)}…` : e.displayName
        ctx.fillText(`${i + 1}. ${name}`, panelX + 12, yRow)
        ctx.textAlign = 'right'
        ctx.fillText(formatUsd(e.usdValue, true), panelX + panelW - 12, yRow)
        ctx.textAlign = 'left'
      }
    }

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
