import type { RoomSummary } from '@/types/rooms'
import { isSnapshotReady } from './snapshot'
import { massToUsd } from '@/lib/formatter'

// Existing lobby summary helper
export const summarizeServer = (room: RoomSummary) => ({
  label: `${room.name} (${room.playerCount}/${room.maxPlayers})`,
  bankroll: room.totalWorldEth,
})

// --- Game canvas adapter types ---

// Client-side shape of the input message we send to the server.
// Mirrors the server's InputMessage (see GameState.ts), but kept local here
// so the client does not depend directly on server source files.
export type ClientInputMessage = {
  x: number
  y: number
  q: boolean // exit trigger (hold Q)
  space: boolean // split trigger (tap Spacebar)
  w: boolean // eject mass trigger (Key W)
}

// Minimal, renderer-friendly view of a blob
export type BlobView = {
  id: string
  x: number
  y: number
  radius: number
  mass: number
  color: string
  displayName: string
  usdValue: number
  isLocal: boolean
  isExiting: boolean
  exitProgress: number // 0-1
  exitRadius: number // already-shrunk radius for rendering while exiting
}

export type PelletView = {
  id: string
  x: number
  y: number
  radius: number
  color: string
  mass: number
  usdValue: number
}

export type EjectedMassView = {
  id: string
  x: number
  y: number
  radius: number
  color: string
}

export type VirusView = {
  id: string
  x: number
  y: number
  radius: number
  color: string
}

export type WorldViewModel = {
  camera: {
    x: number
    y: number
    zoom: number
  }
  world: {
    width: number
    height: number
  }
  playerBlobs: BlobView[]
  otherBlobs: BlobView[]
  pellets: PelletView[]
  ejectedMass: EjectedMassView[]
  viruses: VirusView[]
  hud: {
    currentMass: number
    spawnMass: number
    payoutEstimate: number
    exitHoldProgress: number // 0-1
    pingMs?: number
    serverLabel?: string
    localUsdWorth: number
    /** Optional: allow hiding certain HUD widgets (useful for mock/demo backgrounds). */
    showTopLeftStats?: boolean
    /** Optional: allow hiding certain HUD widgets (useful for mock/demo backgrounds). */
    showBottomWorth?: boolean
    /** Optional: allow hiding leaderboard panel (useful for mock/demo backgrounds). */
    showLeaderboard?: boolean
    leaderboard: Array<{
      sessionId: string
      displayName: string
      usdValue: number
      isLocal: boolean
    }>
  }
}

// Controller interface used by the input layer. World.tsx wires this up
// to keyboard/mouse events via attachInputListeners().
export type WorldInputController = {
  onPointerMove: (pos: { x: number; y: number }) => void
  onWheelZoom: (event: { deltaY: number }) => void
  onExitKeyDown: () => void
  onExitKeyUp: () => void
  onSplitKeyDown: () => void
  onSplitKeyUp: () => void
  onEjectKeyDown: () => void
  onEjectKeyUp: () => void
}

export type WorldAdapter = {
  getViewModel: () => WorldViewModel | null
  controller: WorldInputController
}

// Internal structural types for reading the Colyseus GameState shape.
// We keep these deliberately loose and structural so we don't have to
// import server-side schema classes into the client bundle.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMapSchema<T> = { forEach: (cb: (value: T, key: string) => void) => void } & any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArraySchema<T> = { forEach: (cb: (value: T, index: number) => void) => void } & any

type ServerBlob = {
  id: string
  owner: string
  x: number
  y: number
  mass: number
  radius: number
  timeSinceSplit: number
  canMerge: boolean
  isExiting: boolean
  exitProgress: number
  originalRadius: number
}

type ServerPlayer = {
  sessionId: string
  wallet: string
  displayName?: string
  spawnMass: number
  currentMass: number
  isAlive: boolean
  isExiting: boolean
  exitStartedAt: number
  blobs: AnyArraySchema<ServerBlob>
  color: number
}

type ServerPellet = {
  x: number
  y: number
  mass: number
  radius: number
  color: number
}

type ServerEjectedMass = {
  x: number
  y: number
  radius: number
  color: number
}

type ServerGameState = {
  players: AnyMapSchema<ServerPlayer>
  pellets: AnyMapSchema<ServerPellet>
  ejectedMass: AnyMapSchema<ServerEjectedMass>
  worldWidth: number
  worldHeight: number
  exitHoldMs: number
  massPerEth: number
}

export type CreateWorldAdapterOptions = {
  getStateSnapshot: () => ServerGameState | null
  sendInput: (input: ClientInputMessage) => void
  sessionId: string | null
  /** Current ETH→USD price from CoinGecko (or null if unavailable). */
  ethUsd: number | null
}

export const createWorldAdapter = ({
  getStateSnapshot,
  sendInput,
  sessionId,
  ethUsd,
}: CreateWorldAdapterOptions): WorldAdapter => {
  // Pointer position in normalized canvas coordinates (0-1)
  // (0.5, 0.5) is the center of the screen.
  let pointerX = 0.5
  let pointerY = 0.5
  let exitKeyHeld = false
  let splitHeld = false
  let ejectHeld = false

  const buildViewModel = (state: ServerGameState): WorldViewModel => {
    const worldWidth = state.worldWidth ?? 4000
    const worldHeight = state.worldHeight ?? 4000

    const playerBlobs: BlobView[] = []
    const otherBlobs: BlobView[] = []
    const pellets: PelletView[] = []
    const ejectedMass: EjectedMassView[] = []

    let localPlayer: ServerPlayer | null = null
    const nameBySessionId = new Map<string, string>()

    state.players.forEach((player: ServerPlayer) => {
      if (!player.isAlive) return

      const isLocal = sessionId != null && player.sessionId === sessionId
      if (isLocal) {
        localPlayer = player
      }

      const displayName =
        (typeof player.displayName === 'string' && player.displayName.trim().length > 0
          ? player.displayName.trim()
          : player.wallet
            ? `${player.wallet.slice(0, 6)}...${player.wallet.slice(-4)}`
            : 'player')
      nameBySessionId.set(player.sessionId, displayName)

      // Defensive: during initial join, some clients may observe partially
      // hydrated schema objects briefly.
      player.blobs?.forEach?.((blob: ServerBlob) => {
        const usdValue = massToUsd(blob.mass, state.massPerEth ?? 100, ethUsd)
        const base: BlobView = {
          id: blob.id,
          x: blob.x,
          y: blob.y,
          radius: blob.radius,
          mass: blob.mass,
          color: `hsl(${player.color * 30}, 80%, 60%)`,
          displayName,
          usdValue,
          isLocal,
          isExiting: blob.isExiting,
          exitProgress: blob.exitProgress ?? 0,
          exitRadius: blob.isExiting && blob.originalRadius
            ? blob.originalRadius * (1 - (blob.exitProgress ?? 0))
            : blob.radius,
        }

        if (isLocal) {
          playerBlobs.push(base)
        } else {
          otherBlobs.push(base)
        }
      })
    })

    state.pellets.forEach((p: ServerPellet, id: string) => {
      pellets.push({
        id,
        x: p.x,
        y: p.y,
        radius: p.radius,
        color: `hsl(${p.color * 40}, 80%, 60%)`,
        mass: p.mass ?? 1,
        usdValue: massToUsd(p.mass ?? 1, state.massPerEth ?? 100, ethUsd),
      })
    })

    state.ejectedMass.forEach((m: ServerEjectedMass, id: string) => {
      ejectedMass.push({
        id,
        x: m.x,
        y: m.y,
        radius: m.radius,
        color: `hsl(${m.color * 40}, 70%, 55%)`,
      })
    })

    // Basic camera: center on the local player's mass-weighted center
    let cameraX = worldWidth / 2
    let cameraY = worldHeight / 2
    let zoom = 1
    let currentMass = 0
    let spawnMass = 0
    let exitHoldProgress = 0
    let localUsdWorth = 0

    if (localPlayer) {
      let totalMass = 0
      let sumX = 0
      let sumY = 0

      ;(localPlayer as ServerPlayer).blobs?.forEach?.((blob: ServerBlob) => {
        totalMass += blob.mass
        sumX += blob.x * blob.mass
        sumY += blob.y * blob.mass
      })

      if (totalMass > 0) {
        cameraX = sumX / totalMass
        cameraY = sumY / totalMass
      }

      currentMass = (localPlayer as ServerPlayer).currentMass
      spawnMass = (localPlayer as ServerPlayer).spawnMass
      localUsdWorth = massToUsd(currentMass, state.massPerEth ?? 100, ethUsd)

      // Very simple zoom rule: smaller mass → zoom in, larger mass → zoom out
      const MASS_ZOOM_BASE = 0.9
      const MASS_ZOOM_MIN = 0.5
      const MASS_ZOOM_MAX = 1.4
      const massFactor = Math.max(1, Math.log10(currentMass + 10))
      zoom = Math.min(MASS_ZOOM_MAX, Math.max(MASS_ZOOM_MIN, MASS_ZOOM_BASE / massFactor))

      // Exit progress: use the maximum blob exit progress
      ;(localPlayer as ServerPlayer).blobs?.forEach?.((blob: ServerBlob) => {
        if (blob.exitProgress != null) {
          exitHoldProgress = Math.max(exitHoldProgress, blob.exitProgress)
        }
      })
    }

    // Leaderboard (sorted by USD value)
    const leaderboard: WorldViewModel['hud']['leaderboard'] = []
    state.players.forEach((player: ServerPlayer) => {
      if (!player.isAlive) return
      const displayName =
        nameBySessionId.get(player.sessionId) ??
        (player.wallet ? `${player.wallet.slice(0, 6)}...${player.wallet.slice(-4)}` : 'player')
      const usdValue = massToUsd(player.currentMass ?? 0, state.massPerEth ?? 100, ethUsd)
      leaderboard.push({
        sessionId: player.sessionId,
        displayName,
        usdValue,
        isLocal: sessionId != null && player.sessionId === sessionId,
      })
    })
    leaderboard.sort((a, b) => b.usdValue - a.usdValue)

    return {
      camera: { x: cameraX, y: cameraY, zoom },
      world: { width: worldWidth, height: worldHeight },
      playerBlobs,
      otherBlobs,
      pellets,
      ejectedMass,
      viruses: [],
      hud: {
        currentMass,
        spawnMass,
        payoutEstimate: 0, // filled in later when economy wiring is ready
        exitHoldProgress,
        localUsdWorth,
        leaderboard,
      },
    }
  }

  // Convert current pointer position into a direction vector from the
  // center of the screen in screen-space. This is what we send as x/y.
  const computeDirectionFromPointer = () => {
    const dx = pointerX - 0.5
    const dy = pointerY - 0.5
    let dirX = dx
    let dirY = dy
    const mag = Math.hypot(dirX, dirY)
    if (mag > 0) {
      dirX /= mag
      dirY /= mag
    } else {
      dirX = 0
      dirY = 0
    }
    return { x: dirX, y: dirY }
  }

  // Throttle continuous movement input so we don't spam the server.
  const MOVE_SEND_INTERVAL_MS = 30
  let lastMoveSentAt = 0

  const controller: WorldInputController = {
    onPointerMove: ({ x, y }) => {
      pointerX = x
      pointerY = y

      const now = performance.now()
      if (now - lastMoveSentAt < MOVE_SEND_INTERVAL_MS) return
      lastMoveSentAt = now

      const { x: dirX, y: dirY } = computeDirectionFromPointer()

      sendInput({
        x: dirX,
        y: dirY,
        q: exitKeyHeld,
        space: splitHeld,
        w: ejectHeld,
      })
    },
    onWheelZoom: () => {
      // No-op for the legacy full-schema adapter.
    },
    onExitKeyDown: () => {
      exitKeyHeld = true
      const { x, y } = computeDirectionFromPointer()
      sendInput({ x, y, q: true, space: splitHeld, w: ejectHeld })
    },
    onExitKeyUp: () => {
      exitKeyHeld = false
      const { x, y } = computeDirectionFromPointer()
      sendInput({ x, y, q: false, space: splitHeld, w: ejectHeld })
    },
    onSplitKeyDown: () => {
      const { x, y } = computeDirectionFromPointer()
      splitHeld = true
      sendInput({ x, y, q: exitKeyHeld, space: true, w: ejectHeld })
    },
    onSplitKeyUp: () => {
      const { x, y } = computeDirectionFromPointer()
      splitHeld = false
      sendInput({ x, y, q: exitKeyHeld, space: false, w: ejectHeld })
    },
    onEjectKeyDown: () => {
      const { x, y } = computeDirectionFromPointer()
      ejectHeld = true
      sendInput({ x, y, q: exitKeyHeld, space: splitHeld, w: true })
    },
    onEjectKeyUp: () => {
      const { x, y } = computeDirectionFromPointer()
      ejectHeld = false
      sendInput({ x, y, q: exitKeyHeld, space: splitHeld, w: false })
    },
  }

  const getViewModel = (): WorldViewModel | null => {
    const state = getStateSnapshot()
    if (!isSnapshotReady(state)) return null
    return buildViewModel(state as ServerGameState)
  }

  return { getViewModel, controller }
}

// --- Best-parity delta adapter (per-client visible nodes) ---

type DeltaWorldSnapshot = {
  init: unknown | null
  tick: number
  nodes: Map<number, unknown>
  ownedIds: number[]
}

type ServerColor = { r: number; g: number; b: number }

type ServerNodeDto = {
  id: number
  kind: 'player' | 'food' | 'ejected' | 'virus'
  x: number
  y: number
  radius?: number
  mass?: number
  color?: ServerColor
  ownerSessionId?: string
  displayName?: string
}

type WorldInitDto = {
  serverId: string
  tickMs: number
  world: { left: number; right: number; top: number; bottom: number }
  massPerEth: number
  exitHoldMs: number
}

function isDeltaSnapshot(state: unknown): state is DeltaWorldSnapshot {
  if (!state || typeof state !== 'object') return false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = state as any
  return s.nodes instanceof Map && Array.isArray(s.ownedIds)
}

function rgbToHslString(rgb: ServerColor, fallbackHue: number = 200): string {
  const r = Math.max(0, Math.min(255, rgb.r)) / 255
  const g = Math.max(0, Math.min(255, rgb.g)) / 255
  const b = Math.max(0, Math.min(255, rgb.b)) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = fallbackHue
  let s = 0
  const l = (max + min) / 2

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1))
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6)
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2)
    } else {
      h = 60 * ((r - g) / delta + 4)
    }
  }

  if (h < 0) h += 360
  const hh = Math.round(h)
  const ss = Math.round(s * 100)
  const ll = Math.round(l * 100)
  return `hsl(${hh}, ${ss}%, ${ll}%)`
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export const createDeltaWorldAdapter = ({
  getStateSnapshot,
  sendInput,
  sessionId,
  ethUsd,
}: CreateWorldAdapterOptions): WorldAdapter => {
  let pointerX = 0.5
  let pointerY = 0.5
  let exitKeyHeld = false
  let exitHoldStartedAt: number | null = null
  let splitHeld = false
  let ejectHeld = false

  // Ogar-style wheel zoom factor (>= 1)
  let wheelZoom = 1

  // Smoothed camera state (Ogar3 client style)
  let cameraX = 0
  let cameraY = 0
  let cameraZoom = 1
  let hasCameraInit = false
  let hasPlayerView = false

  type InterpState = {
    ox: number
    oy: number
    or: number
    nx: number
    ny: number
    nr: number
    updatedAt: number
  }

  const interpById = new Map<number, InterpState>()
  let lastInterpTick = -1
  const INTERP_WINDOW_MS = 120

  const syncInterpolation = (snap: DeltaWorldSnapshot, now: number) => {
    if (snap.tick === lastInterpTick) return
    lastInterpTick = snap.tick

    const seen = new Set<number>()
    for (const [id, n] of snap.nodes.entries()) {
      seen.add(id)
      const node = n as ServerNodeDto
      const x = node.x ?? 0
      const y = node.y ?? 0
      const r = node.radius ?? 0

      const prev = interpById.get(id)
      if (!prev) {
        interpById.set(id, { ox: x, oy: y, or: r, nx: x, ny: y, nr: r, updatedAt: now })
        continue
      }

      // IMPORTANT: When a new tick arrives, do NOT snap the interpolation origin
      // to the previous target. Ogar3 first advances to the current interpolated
      // position, then uses that as the new origin, which avoids visible jitter
      // when updates arrive faster than the interpolation window.
      const t = clamp((now - prev.updatedAt) / INTERP_WINDOW_MS, 0, 1)
      const curX = prev.ox + (prev.nx - prev.ox) * t
      const curY = prev.oy + (prev.ny - prev.oy) * t
      const curR = prev.or + (prev.nr - prev.or) * t

      prev.ox = curX
      prev.oy = curY
      prev.or = curR
      prev.nx = x
      prev.ny = y
      prev.nr = r
      prev.updatedAt = now
    }

    for (const id of interpById.keys()) {
      if (!seen.has(id)) interpById.delete(id)
    }
  }

  const getInterpolated = (id: number, node: ServerNodeDto, now: number) => {
    const s = interpById.get(id)
    if (!s) return { x: node.x, y: node.y, radius: node.radius ?? 0 }
    const t = clamp((now - s.updatedAt) / INTERP_WINDOW_MS, 0, 1)
    return {
      x: s.ox + (s.nx - s.ox) * t,
      y: s.oy + (s.ny - s.oy) * t,
      radius: s.or + (s.nr - s.or) * t,
    }
  }

  const updateCamera = (snap: DeltaWorldSnapshot, init: WorldInitDto, now: number) => {
    if (!hasCameraInit) {
      cameraX = (init.world.left + init.world.right) / 2
      cameraY = (init.world.top + init.world.bottom) / 2
      cameraZoom = 1
      hasCameraInit = true
    }

    let totalSize = 0
    let sumX = 0
    let sumY = 0
    let count = 0

    for (const id of snap.ownedIds) {
      const raw = snap.nodes.get(id) as ServerNodeDto | undefined
      if (!raw || raw.kind !== 'player') continue
      const it = getInterpolated(id, raw, now)
      totalSize += it.radius
      sumX += it.x
      sumY += it.y
      count++
    }

    if (count <= 0) {
      hasPlayerView = false
      return { x: cameraX, y: cameraY, zoom: cameraZoom }
    }

    const targetX = Math.trunc(sumX / count)
    const targetY = Math.trunc(sumY / count)

    const sizeForZoom = Math.max(1, totalSize)
    const factor = Math.pow(Math.min(64.0 / sizeForZoom, 1), 0.4)

    const width = window.innerWidth
    const height = window.innerHeight
    const ratio = Math.max(height / 1080, width / 1920)
    const targetZoom = factor * ratio * wheelZoom

    if (!hasPlayerView) {
      cameraX = targetX
      cameraY = targetY
      cameraZoom = targetZoom
      hasPlayerView = true
      return { x: cameraX, y: cameraY, zoom: cameraZoom }
    }

    cameraZoom = (9 * cameraZoom + targetZoom) / 10
    cameraX = (cameraX + targetX) / 2
    cameraY = (cameraY + targetY) / 2

    return { x: cameraX, y: cameraY, zoom: cameraZoom }
  }

  const computeMouseWorld = (): { x: number; y: number } => {
    const snap = getStateSnapshot()
    if (!isDeltaSnapshot(snap) || !snap.init) {
      return { x: 0, y: 0 }
    }

    const now = performance.now()
    syncInterpolation(snap, now)

    const init = snap.init as WorldInitDto
    // IMPORTANT: Do not advance camera smoothing from the input path.
    // Camera smoothing is advanced from getViewModel() (render loop) only.
    if (!hasCameraInit) {
      cameraX = (init.world.left + init.world.right) / 2
      cameraY = (init.world.top + init.world.bottom) / 2
      cameraZoom = 1
      hasCameraInit = true
    }
    const view = { x: cameraX, y: cameraY, zoom: cameraZoom }

    const width = window.innerWidth
    const height = window.innerHeight
    const screenX = pointerX * width
    const screenY = pointerY * height

    const x = view.x + (screenX - width / 2) / view.zoom
    const y = view.y + (screenY - height / 2) / view.zoom
    return { x, y }
  }

  // Throttle continuous movement input so we don't spam the server.
  const MOVE_SEND_INTERVAL_MS = 30
  let lastMoveSentAt = 0

  const maybeSendMove = (now: number, mouse: { x: number; y: number }) => {
    if (now - lastMoveSentAt < MOVE_SEND_INTERVAL_MS) return
    lastMoveSentAt = now
    sendInput({ x: mouse.x, y: mouse.y, q: exitKeyHeld, space: splitHeld, w: ejectHeld })
  }

  const controller: WorldInputController = {
    onPointerMove: ({ x, y }) => {
      pointerX = x
      pointerY = y

      const now = performance.now()
      const m = computeMouseWorld()
      maybeSendMove(now, m)
    },
    onWheelZoom: ({ deltaY }) => {
      // Ogar wheel zoom: zoom *= 0.9^(wheelDelta / -120)
      wheelZoom *= Math.pow(0.9, deltaY / 120)
      wheelZoom = Math.max(1, wheelZoom)
      const max = cameraZoom > 0 ? 4 / cameraZoom : 4
      wheelZoom = Math.min(wheelZoom, max)
    },
    onExitKeyDown: () => {
      exitKeyHeld = true
      if (!exitHoldStartedAt) exitHoldStartedAt = performance.now()
      const m = computeMouseWorld()
      sendInput({ x: m.x, y: m.y, q: true, space: splitHeld, w: ejectHeld })
    },
    onExitKeyUp: () => {
      exitKeyHeld = false
      exitHoldStartedAt = null
      const m = computeMouseWorld()
      sendInput({ x: m.x, y: m.y, q: false, space: splitHeld, w: ejectHeld })
    },
    onSplitKeyDown: () => {
      splitHeld = true
      const m = computeMouseWorld()
      sendInput({ x: m.x, y: m.y, q: exitKeyHeld, space: splitHeld, w: ejectHeld })
    },
    onSplitKeyUp: () => {
      splitHeld = false
      const m = computeMouseWorld()
      sendInput({ x: m.x, y: m.y, q: exitKeyHeld, space: splitHeld, w: ejectHeld })
    },
    onEjectKeyDown: () => {
      ejectHeld = true
      const m = computeMouseWorld()
      sendInput({ x: m.x, y: m.y, q: exitKeyHeld, space: splitHeld, w: ejectHeld })
    },
    onEjectKeyUp: () => {
      ejectHeld = false
      const m = computeMouseWorld()
      sendInput({ x: m.x, y: m.y, q: exitKeyHeld, space: splitHeld, w: ejectHeld })
    },
  }

  const getViewModel = (): WorldViewModel | null => {
    const snap = getStateSnapshot()
    if (!isDeltaSnapshot(snap) || !snap.init) return null

    const now = performance.now()
    syncInterpolation(snap, now)

    const init = snap.init as WorldInitDto
    const worldWidth = init.world.right - init.world.left
    const worldHeight = init.world.bottom - init.world.top
    const massPerEth = init.massPerEth ?? 100

    const ownedSet = new Set<number>(snap.ownedIds)

    const view = updateCamera(snap, init, now)
    const cameraX = view.x
    const cameraY = view.y
    const zoom = view.zoom

    // Keep sending movement updates even when the mouse is still.
    // As the camera follows the player, the world-space point under the cursor changes,
    // so the server needs updated x/y to keep moving in the intended direction.
    if (snap.ownedIds.length > 0) {
      const width = window.innerWidth
      const height = window.innerHeight
      const screenX = pointerX * width
      const screenY = pointerY * height
      const x = cameraX + (screenX - width / 2) / zoom
      const y = cameraY + (screenY - height / 2) / zoom
      maybeSendMove(now, { x, y })
    }

    const playerBlobs: BlobView[] = []
    const otherBlobs: BlobView[] = []
    const pellets: PelletView[] = []
    const ejectedMass: EjectedMassView[] = []
    const viruses: VirusView[] = []

    let currentMass = 0
    for (const id of snap.ownedIds) {
      const node = snap.nodes.get(id) as ServerNodeDto | undefined
      if (!node || node.kind !== 'player') continue
      currentMass += node.mass ?? 0
    }

    // Exit progress purely client-side (overlay)
    let exitHoldProgress = 0
    if (exitKeyHeld && exitHoldStartedAt != null && init.exitHoldMs > 0) {
      exitHoldProgress = Math.min(1, (now - exitHoldStartedAt) / init.exitHoldMs)
    }

    for (const [id, n] of snap.nodes.entries()) {
      const node = n as ServerNodeDto
      if (node.kind === 'player') {
        const isLocal = ownedSet.has(node.id)
        const it = getInterpolated(id, node, now)
        const displayName =
          (typeof node.displayName === 'string' && node.displayName.trim().length > 0
            ? node.displayName
            : typeof node.ownerSessionId === 'string'
              ? node.ownerSessionId
              : 'player')
        const color = node.color ? rgbToHslString(node.color) : `hsl(200, 80%, 60%)`
        const mass = node.mass ?? 0
        const radius = it.radius
        const usdValue = massToUsd(mass, massPerEth, ethUsd)
        const viewBlob: BlobView = {
          id: String(node.id),
          x: it.x,
          y: it.y,
          radius,
          mass,
          color,
          displayName,
          usdValue,
          isLocal,
          isExiting: false,
          exitProgress: 0,
          exitRadius: radius,
        }
        if (isLocal) playerBlobs.push(viewBlob)
        else otherBlobs.push(viewBlob)
        continue
      }

      if (node.kind === 'food') {
        const it = getInterpolated(id, node, now)
        const mass = node.mass ?? 1
        const radius = it.radius
        const color = node.color ? rgbToHslString(node.color, 90) : 'hsl(90, 70%, 55%)'
        pellets.push({
          id: String(node.id),
          x: it.x,
          y: it.y,
          radius,
          color,
          mass,
          usdValue: massToUsd(mass, massPerEth, ethUsd),
        })
        continue
      }

      if (node.kind === 'ejected') {
        const it = getInterpolated(id, node, now)
        const color = node.color ? rgbToHslString(node.color, 200) : 'hsl(200, 70%, 55%)'
        ejectedMass.push({ id: String(node.id), x: it.x, y: it.y, radius: it.radius, color })
        continue
      }

      // virus
      const it = getInterpolated(id, node, now)
      viruses.push({
        id: String(node.id),
        x: it.x,
        y: it.y,
        radius: it.radius,
        color: 'hsl(120, 70%, 40%)',
      })
    }

    // Leaderboard (sorted by USD) aggregated by owner.
    const leaderboardByOwner = new Map<string, { sessionId: string; displayName: string; totalMass: number }>()
    for (const n of snap.nodes.values()) {
      const node = n as ServerNodeDto
      if (node.kind !== 'player') continue
      const owner = typeof node.ownerSessionId === 'string' ? node.ownerSessionId : 'unknown'
      const name =
        typeof node.displayName === 'string' && node.displayName.trim().length > 0 ? node.displayName : owner

      const prev = leaderboardByOwner.get(owner)
      if (!prev) {
        leaderboardByOwner.set(owner, { sessionId: owner, displayName: name, totalMass: node.mass ?? 0 })
      } else {
        prev.totalMass += node.mass ?? 0
        if (prev.displayName === prev.sessionId && name !== owner) prev.displayName = name
      }
    }

    const leaderboard: WorldViewModel['hud']['leaderboard'] = []
    for (const p of leaderboardByOwner.values()) {
      leaderboard.push({
        sessionId: p.sessionId,
        displayName: p.displayName,
        usdValue: massToUsd(p.totalMass, massPerEth, ethUsd),
        isLocal: sessionId != null && p.sessionId === sessionId,
      })
    }
    leaderboard.sort((a, b) => b.usdValue - a.usdValue)

    return {
      camera: { x: cameraX, y: cameraY, zoom },
      world: { width: worldWidth, height: worldHeight },
      playerBlobs,
      otherBlobs,
      pellets,
      ejectedMass,
      viruses,
      hud: {
        currentMass,
        spawnMass: 0,
        payoutEstimate: 0,
        exitHoldProgress,
        localUsdWorth: massToUsd(currentMass, massPerEth, ethUsd),
        leaderboard,
      },
    }
  }

  return { getViewModel, controller }
}
