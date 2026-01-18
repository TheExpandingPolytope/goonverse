import type { RoomSummary } from '@/types/rooms'
import { isSnapshotReady } from './snapshot'
import { formatUsd, massToEth, massToUsd } from '@/lib/formatter'

const MASS_SCALE = 10_000
const PROTOCOL_VERSION = 4

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
  // Movement
  w: boolean
  a: boolean
  s: boolean
  d: boolean

  // Aim
  aimX: number
  aimY: number

  // Holds
  shoot: boolean
  dash: boolean
  exit: boolean

  // Optional reconciliation
  clientTick?: number
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

export type PelletView = {
  id: string
  x: number
  y: number
  radius: number
  color: string
  mass: number
  usdValue: number
  locked?: boolean
  unlockPop?: number
}

export type EjectedMassView = {
  id: string
  x: number
  y: number
  radius: number
  color: string
}

export type BulletView = {
  id: string
  x: number
  y: number
  radius: number
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
  // Dynamic circular border (POC parity)
  border: {
    radius: number
    targetRadius: number
    velocity: number
    maxRadius: number
    minRadius: number
  }
  playerBlobs: BlobView[]
  otherBlobs: BlobView[]
  pellets: PelletView[]
  ejectedMass: EjectedMassView[]
  bullets: BulletView[]
  viruses: VirusView[]
  hud: {
    currentMass: number
    spawnMass: number
    payoutEstimate: number
    exitHoldProgress: number // 0-1
    dashCooldownTicks?: number
    shootChargeRatio?: number
    shootRecoveryTicks?: number
    stunTicks?: number
    slowTicks?: number
    exitCombatTagTicks?: number
    pnlPct?: number
    pnlUsd?: number
    events?: Array<{ id: number; message: string; variant: 'exit' | 'warn' | 'danger' }>
    transactions?: Array<{ id: number; amount: number; type: 'gain' | 'loss' }>
    pingMs?: number
    serverLabel?: string
    localUsdWorth: number
    localEthWorth: number
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
      ethValue: number
      isLocal: boolean
    }>
  }
}

// Controller interface used by the input layer. World.tsx wires this up
// to keyboard/mouse events via attachInputListeners().
export type WorldInputController = {
  onPointerMove: (pos: { x: number; y: number }) => void
  onWheelZoom: (event: { deltaY: number }) => void
  onMoveKeyChange: (state: Partial<Pick<ClientInputMessage, 'w' | 'a' | 's' | 'd'>>) => void
  onShootKeyDown: () => void
  onShootKeyUp: () => void
  onDashKeyDown: () => void
  onDashKeyUp: () => void
  onExitKeyDown: () => void
  onExitKeyUp: () => void
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
  massScale?: number
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
  let dashHeld = false
  let shootHeld = false
  let wHeld = false
  let aHeld = false
  let sHeld = false
  let dHeld = false

  const buildViewModel = (state: ServerGameState): WorldViewModel => {
    const worldWidth = state.worldWidth ?? 4000
    const worldHeight = state.worldHeight ?? 4000
    const massScale = (state as { massScale?: number })?.massScale ?? MASS_SCALE

    const playerBlobs: BlobView[] = []
    const otherBlobs: BlobView[] = []
    const pellets: PelletView[] = []
    const ejectedMass: EjectedMassView[] = []
    const bullets: BulletView[] = []

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
        const displayMass = blob.mass / massScale
        const usdValue = massToUsd(displayMass, state.massPerEth ?? 100, ethUsd)
        const base: BlobView = {
          id: blob.id,
          x: blob.x,
          y: blob.y,
          radius: blob.radius,
          mass: displayMass,
          color: `hsl(${player.color * 30}, 80%, 60%)`,
          displayName,
          usdValue,
          isLocal,
          isExiting: blob.isExiting,
          exitProgress: blob.exitProgress ?? 0,
          exitRadius: blob.isExiting && blob.originalRadius
            ? blob.originalRadius * (1 - (blob.exitProgress ?? 0))
            : blob.radius,
          vx: blob.vx ?? 0,
          vy: blob.vy ?? 0,
          aimX: blob.targetX ?? blob.x ?? 0,
          aimY: blob.targetY ?? blob.y ?? 0,
          dashChargeRatio: 0,
          shootChargeRatio: 0,
          dashCooldownTicks: 0,
          dashActiveTicks: 0,
          stunTicks: 0,
          slowTicks: 0,
          shootRecoveryTicks: 0,
          exitCombatTagTicks: 0,
          hitFlashTicks: 0,
        }

        if (isLocal) {
          playerBlobs.push(base)
        } else {
          otherBlobs.push(base)
        }
      })
    })

    state.pellets.forEach((p: ServerPellet, id: string) => {
      const displayMass = (p.mass ?? 1) / massScale
      pellets.push({
        id,
        x: p.x,
        y: p.y,
        radius: p.radius,
        color: `hsl(${p.color * 40}, 80%, 60%)`,
        mass: displayMass,
        usdValue: massToUsd(displayMass, state.massPerEth ?? 100, ethUsd),
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
    let localEthWorth = 0
    let pnlPct = 0
    let pnlUsd = 0

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

      currentMass = (localPlayer as ServerPlayer).currentMass / massScale
      spawnMass = (localPlayer as ServerPlayer).spawnMass / massScale
      localUsdWorth = massToUsd(currentMass, state.massPerEth ?? 100, ethUsd)
      localEthWorth = massToEth(currentMass, state.massPerEth ?? 100)
      if (spawnMass > 0) {
        pnlPct = ((currentMass - spawnMass) / spawnMass) * 100
        pnlUsd = massToUsd(currentMass - spawnMass, state.massPerEth ?? 100, ethUsd)
      }

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
      const playerMass = (player.currentMass ?? 0) / massScale
      const usdValue = massToUsd(playerMass, state.massPerEth ?? 100, ethUsd)
      const ethValue = massToEth(playerMass, state.massPerEth ?? 100)
      leaderboard.push({
        sessionId: player.sessionId,
        displayName,
        usdValue,
        ethValue,
        isLocal: sessionId != null && player.sessionId === sessionId,
      })
    })
    leaderboard.sort((a, b) => b.usdValue - a.usdValue)

    return {
      camera: { x: cameraX, y: cameraY, zoom },
      world: { width: worldWidth, height: worldHeight },
      // Default border for legacy adapter (fallback circular border)
      border: {
        radius: Math.max(worldWidth, worldHeight) / 2,
        targetRadius: Math.max(worldWidth, worldHeight) / 2,
        velocity: 0,
        maxRadius: Math.max(worldWidth, worldHeight) / 2,
        minRadius: 700,
      },
      playerBlobs,
      otherBlobs,
      pellets,
      ejectedMass,
      bullets,
      viruses: [],
      hud: {
        currentMass,
        spawnMass,
        payoutEstimate: 0, // filled in later when economy wiring is ready
        exitHoldProgress,
        pnlPct,
        pnlUsd,
        events: [],
        transactions: [],
        localUsdWorth,
        localEthWorth,
        leaderboard,
      },
    }
  }

  // Convert current pointer position into a direction vector (legacy adapter).
  const computeAimFromPointer = () => {
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
    return { aimX: dirX, aimY: dirY }
  }

  // Throttle continuous movement input so we don't spam the server.
  const MOVE_SEND_INTERVAL_MS = 30
  let lastMoveSentAt = 0

  const sendCurrentInput = () => {
    const { aimX, aimY } = computeAimFromPointer()
    sendInput({
      w: wHeld,
      a: aHeld,
      s: sHeld,
      d: dHeld,
      aimX,
      aimY,
      shoot: shootHeld,
      dash: dashHeld,
      exit: exitKeyHeld,
    })
  }

  const controller: WorldInputController = {
    onPointerMove: ({ x, y }) => {
      pointerX = x
      pointerY = y

      const now = performance.now()
      if (now - lastMoveSentAt < MOVE_SEND_INTERVAL_MS) return
      lastMoveSentAt = now
      sendCurrentInput()
    },
    onWheelZoom: () => {
      // No-op for the legacy full-schema adapter.
    },
    onMoveKeyChange: (state) => {
      if (typeof state.w === 'boolean') wHeld = state.w
      if (typeof state.a === 'boolean') aHeld = state.a
      if (typeof state.s === 'boolean') sHeld = state.s
      if (typeof state.d === 'boolean') dHeld = state.d
      sendCurrentInput()
    },
    onShootKeyDown: () => {
      shootHeld = true
      sendCurrentInput()
    },
    onShootKeyUp: () => {
      shootHeld = false
      sendCurrentInput()
    },
    onDashKeyDown: () => {
      dashHeld = true
      sendCurrentInput()
    },
    onDashKeyUp: () => {
      dashHeld = false
      sendCurrentInput()
    },
    onExitKeyDown: () => {
      exitKeyHeld = true
      sendCurrentInput()
    },
    onExitKeyUp: () => {
      exitKeyHeld = false
      sendCurrentInput()
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
  // Dynamic border state (POC parity)
  border?: {
    radius: number
    targetRadius: number
    velocity: number
  }
}

type ServerColor = { r: number; g: number; b: number }

type ServerNodeDto = {
  id: number
  kind: 'player' | 'bullet' | 'pellet' | 'spill' | 'obstacle' | 'spillCluster'
  x: number
  y: number
  radius?: number
  mass?: number
  spawnMass?: number
  color?: ServerColor
  ownerSessionId?: string
  displayName?: string
  flags?: number
  exitProgress?: number
  attackerSessionId?: string
  victimSessionId?: string
  unlockTick?: number
  count?: number
  vx?: number
  vy?: number
  aimX?: number
  aimY?: number
  dashChargeRatio?: number
  shootChargeRatio?: number
  dashCooldownTicks?: number
  dashActiveTicks?: number
  stunTicks?: number
  slowTicks?: number
  shootRecoveryTicks?: number
  exitCombatTagTicks?: number
  hitFlashTicks?: number
}

type WorldInitDto = {
  protocolVersion?: number
  serverId: string
  tickMs: number
  world: { left: number; right: number; top: number; bottom: number }
  // Dynamic circular border (POC parity)
  border?: {
    radius: number
    targetRadius: number
    maxRadius: number
    minRadius: number
  }
  massPerEth: number
  exitHoldMs: number
  massScale?: number
}

type HudEvent = { id: number; message: string; variant: 'exit' | 'warn' | 'danger' }
type HudTransaction = { id: number; amount: number; type: 'gain' | 'loss' }

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
  let shootHeld = false
  let dashHeld = false
  let wHeld = false
  let aHeld = false
  let sHeld = false
  let dHeld = false

  let lastHudTick = -1
  let prevLocalMassRaw = 0
  let prevExitProgress = 0
  let prevStunTicks = 0
  let prevSlowTicks = 0
  let prevExitCombatTagTicks = 0
  let nextEventId = 1
  let nextTxId = 1
  const events: HudEvent[] = []
  const transactions: HudTransaction[] = []

  // POC-style camera constants (diep.io-ish)
  const POC_ZOOM_BASE = 1.4
  const POC_ZOOM_MIN = 0.8
  const POC_SPEED_ZOOM_REF = 15
  const POC_CAM_LOOKAHEAD = 60
  const POC_CAM_LERP = 0.15
  const POC_ZOOM_LERP = 0.05

  // Smoothed camera state (POC style)
  let cameraX = 0
  let cameraY = 0
  let cameraZoom = 1
  let hasCameraInit = false
  let hasPlayerView = false

  const FLAG_EXITING = 1 << 2

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
      cameraZoom = POC_ZOOM_BASE
      hasCameraInit = true
    }

    const localId = snap.ownedIds[0]
    if (localId == null) {
      hasPlayerView = false
      return { x: cameraX, y: cameraY, zoom: cameraZoom }
    }

    const raw = snap.nodes.get(localId) as ServerNodeDto | undefined
    if (!raw || raw.kind !== 'player') {
      hasPlayerView = false
      return { x: cameraX, y: cameraY, zoom: cameraZoom }
    }

    const it = getInterpolated(localId, raw, now)

    // Use server-replicated aim point for look-ahead.
    const aimX = raw.aimX ?? it.x
    const aimY = raw.aimY ?? it.y
    const aimAngle = Math.atan2(aimY - it.y, aimX - it.x)

    const targetX = it.x + Math.cos(aimAngle) * POC_CAM_LOOKAHEAD
    const targetY = it.y + Math.sin(aimAngle) * POC_CAM_LOOKAHEAD

    const speed = Math.hypot(raw.vx ?? 0, raw.vy ?? 0)
    const speedRatio = Math.min(1, speed / POC_SPEED_ZOOM_REF)
    const targetZoom = POC_ZOOM_BASE - speedRatio * (POC_ZOOM_BASE - POC_ZOOM_MIN)

    if (!hasPlayerView) {
      cameraX = Math.trunc(targetX)
      cameraY = Math.trunc(targetY)
      cameraZoom = targetZoom
      hasPlayerView = true
      return { x: cameraX, y: cameraY, zoom: cameraZoom }
    }

    cameraZoom += (targetZoom - cameraZoom) * POC_ZOOM_LERP
    cameraX += (targetX - cameraX) * POC_CAM_LERP
    cameraY += (targetY - cameraY) * POC_CAM_LERP

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
    if (init.protocolVersion && init.protocolVersion !== PROTOCOL_VERSION) {
      return { x: 0, y: 0 }
    }
    // IMPORTANT: Do not advance camera smoothing from the input path.
    // Camera smoothing is advanced from getViewModel() (render loop) only.
    if (!hasCameraInit) {
      cameraX = (init.world.left + init.world.right) / 2
      cameraY = (init.world.top + init.world.bottom) / 2
      cameraZoom = POC_ZOOM_BASE
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

  const sendCurrentInput = (mouse: { x: number; y: number }) => {
    sendInput({
      w: wHeld,
      a: aHeld,
      s: sHeld,
      d: dHeld,
      aimX: mouse.x,
      aimY: mouse.y,
      shoot: shootHeld,
      dash: dashHeld,
      exit: exitKeyHeld,
    })
  }

  const maybeSendMove = (now: number, mouse: { x: number; y: number }) => {
    if (now - lastMoveSentAt < MOVE_SEND_INTERVAL_MS) return
    lastMoveSentAt = now
    sendCurrentInput(mouse)
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
      // POC parity: wheel zoom disabled.
      void deltaY
    },
    onMoveKeyChange: (state) => {
      if (typeof state.w === 'boolean') wHeld = state.w
      if (typeof state.a === 'boolean') aHeld = state.a
      if (typeof state.s === 'boolean') sHeld = state.s
      if (typeof state.d === 'boolean') dHeld = state.d
      const m = computeMouseWorld()
      sendCurrentInput(m)
    },
    onShootKeyDown: () => {
      shootHeld = true
      const m = computeMouseWorld()
      sendCurrentInput(m)
    },
    onShootKeyUp: () => {
      shootHeld = false
      const m = computeMouseWorld()
      sendCurrentInput(m)
    },
    onDashKeyDown: () => {
      dashHeld = true
      const m = computeMouseWorld()
      sendCurrentInput(m)
    },
    onDashKeyUp: () => {
      dashHeld = false
      const m = computeMouseWorld()
      sendCurrentInput(m)
    },
    onExitKeyDown: () => {
      exitKeyHeld = true
      const m = computeMouseWorld()
      sendCurrentInput(m)
    },
    onExitKeyUp: () => {
      exitKeyHeld = false
      const m = computeMouseWorld()
      sendCurrentInput(m)
    },
  }

  const getViewModel = (): WorldViewModel | null => {
    const snap = getStateSnapshot()
    if (!isDeltaSnapshot(snap) || !snap.init) return null

    const now = performance.now()
    syncInterpolation(snap, now)

    const init = snap.init as WorldInitDto
    if (init.protocolVersion && init.protocolVersion !== PROTOCOL_VERSION) return null
    const massScale = init.massScale ?? MASS_SCALE
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
    const bullets: BulletView[] = []
    const viruses: VirusView[] = []
    let localNode: ServerNodeDto | null = null
    let localSpawnMassRaw = 0

    let currentMassRaw = 0
    for (const id of snap.ownedIds) {
      const node = snap.nodes.get(id) as ServerNodeDto | undefined
      if (!node || node.kind !== 'player') continue
      currentMassRaw += node.mass ?? 0
    }
    const currentMass = currentMassRaw / massScale

    // Exit progress from server (authoritative)
    let exitHoldProgress = 0

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
        const mass = (node.mass ?? 0) / massScale
        const radius = it.radius
        const usdValue = massToUsd(mass, massPerEth, ethUsd)
        const isExiting = ((node.flags ?? 0) & FLAG_EXITING) !== 0
        const exitProgress = node.exitProgress ?? 0
        if (isLocal) {
          localNode = node
          if (typeof node.spawnMass === 'number') {
            localSpawnMassRaw = node.spawnMass
          }
          exitHoldProgress = Math.max(exitHoldProgress, exitProgress)
        }
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
          isExiting,
          exitProgress,
          exitRadius: isExiting ? radius * (1 - exitProgress) : radius,
          vx: node.vx ?? 0,
          vy: node.vy ?? 0,
          aimX: node.aimX ?? it.x,
          aimY: node.aimY ?? it.y,
          dashChargeRatio: node.dashChargeRatio ?? 0,
          shootChargeRatio: node.shootChargeRatio ?? 0,
          dashCooldownTicks: node.dashCooldownTicks ?? 0,
          dashActiveTicks: node.dashActiveTicks ?? 0,
          stunTicks: node.stunTicks ?? 0,
          slowTicks: node.slowTicks ?? 0,
          shootRecoveryTicks: node.shootRecoveryTicks ?? 0,
          exitCombatTagTicks: node.exitCombatTagTicks ?? 0,
          hitFlashTicks: node.hitFlashTicks ?? 0,
        }
        if (isLocal) playerBlobs.push(viewBlob)
        else otherBlobs.push(viewBlob)
        continue
      }

      if (node.kind === 'pellet') {
        const it = getInterpolated(id, node, now)
        const mass = (node.mass ?? 1) / massScale
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
          locked: false,
          unlockPop: 0,
        })
        continue
      }

      if (node.kind === 'spill') {
        const it = getInterpolated(id, node, now)
        const mass = (node.mass ?? 1) / massScale
        const radius = it.radius
        const color = node.color ? rgbToHslString(node.color, 40) : 'hsl(40, 80%, 55%)'
        const unlockTick = node.unlockTick ?? 0
        const isLocked = sessionId != null && node.victimSessionId === sessionId && snap.tick < unlockTick
        const unlockPop =
          unlockTick > 0 && snap.tick >= unlockTick && snap.tick - unlockTick < 8
            ? 1 - (snap.tick - unlockTick) / 8
            : 0
        pellets.push({
          id: String(node.id),
          x: it.x,
          y: it.y,
          radius,
          color,
          mass,
          usdValue: massToUsd(mass, massPerEth, ethUsd),
          locked: isLocked,
          unlockPop,
        })
        continue
      }

      if (node.kind === 'bullet') {
        const it = getInterpolated(id, node, now)
        bullets.push({ id: String(node.id), x: it.x, y: it.y, radius: it.radius })
        continue
      }

      if (node.kind === 'obstacle') {
        const it = getInterpolated(id, node, now)
        viruses.push({
          id: String(node.id),
          x: it.x,
          y: it.y,
          radius: it.radius,
          color: 'hsl(210, 5%, 45%)',
        })
        continue
      }

      // spillCluster (LOD-only)
      if (node.kind === 'spillCluster') {
        const it = getInterpolated(id, node, now)
        pellets.push({
          id: String(node.id),
          x: it.x,
          y: it.y,
          radius: it.radius,
          color: 'hsl(40, 20%, 40%)',
          mass: (node.mass ?? 1) / massScale,
          usdValue: Number.NaN,
          locked: false,
          unlockPop: 0,
        })
      }
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
      const displayMass = p.totalMass / massScale
      leaderboard.push({
        sessionId: p.sessionId,
        displayName: p.displayName,
        usdValue: massToUsd(displayMass, massPerEth, ethUsd),
        ethValue: massToEth(displayMass, massPerEth),
        isLocal: sessionId != null && p.sessionId === sessionId,
      })
    }
    leaderboard.sort((a, b) => b.usdValue - a.usdValue)

    const spawnMass = localSpawnMassRaw > 0 ? localSpawnMassRaw / massScale : 0
    const pnlMass = currentMass - spawnMass
    const pnlUsd = spawnMass > 0 ? massToUsd(pnlMass, massPerEth, ethUsd) : 0
    const pnlPct = spawnMass > 0 ? (pnlMass / spawnMass) * 100 : 0

    if (snap.tick !== lastHudTick && localNode) {
      lastHudTick = snap.tick

      // Transactions (mass delta)
      const delta = currentMassRaw - prevLocalMassRaw
      if (delta !== 0) {
        const amountMass = Math.abs(delta) / massScale
        const amountUsd = massToUsd(amountMass, massPerEth, ethUsd)
        transactions.unshift({ id: nextTxId++, amount: amountUsd, type: delta > 0 ? 'gain' : 'loss' })
        if (transactions.length > 5) transactions.length = 5
      }

      const exitProgress = localNode.exitProgress ?? 0
      if (exitProgress > 0 && prevExitProgress === 0) {
        events.unshift({
          id: nextEventId++,
          message: `CASHING OUT ${formatUsd(localUsdWorth, true)}`,
          variant: 'exit',
        })
      } else if (exitProgress === 0 && prevExitProgress > 0) {
        events.unshift({ id: nextEventId++, message: 'CASHOUT CANCELLED', variant: 'danger' })
      }

      if ((localNode.stunTicks ?? 0) > 0 && prevStunTicks === 0) {
        events.unshift({ id: nextEventId++, message: 'STUNNED', variant: 'warn' })
      }

      if ((localNode.slowTicks ?? 0) > 0 && prevSlowTicks === 0) {
        events.unshift({ id: nextEventId++, message: 'SLOWED', variant: 'warn' })
      }

      if ((localNode.exitCombatTagTicks ?? 0) > 0 && prevExitCombatTagTicks === 0) {
        events.unshift({ id: nextEventId++, message: 'IN COMBAT', variant: 'danger' })
      }

      if (events.length > 6) events.length = 6

      prevLocalMassRaw = currentMassRaw
      prevExitProgress = exitProgress
      prevStunTicks = localNode.stunTicks ?? 0
      prevSlowTicks = localNode.slowTicks ?? 0
      prevExitCombatTagTicks = localNode.exitCombatTagTicks ?? 0
    } else if (snap.tick !== lastHudTick && !localNode) {
      lastHudTick = snap.tick
      prevLocalMassRaw = currentMassRaw
      prevExitProgress = 0
      prevStunTicks = 0
      prevSlowTicks = 0
      prevExitCombatTagTicks = 0
    }

    // Build border state from init + delta
    const borderRadius = snap.border?.radius ?? init.border?.radius ?? init.border?.minRadius ?? 700
    const borderTargetRadius = snap.border?.targetRadius ?? init.border?.targetRadius ?? borderRadius
    const borderVelocity = snap.border?.velocity ?? 0
    const borderMaxRadius = init.border?.maxRadius ?? 11314
    const borderMinRadius = init.border?.minRadius ?? 700

    return {
      camera: { x: cameraX, y: cameraY, zoom },
      world: { width: worldWidth, height: worldHeight },
      // Dynamic circular border (POC parity)
      border: {
        radius: borderRadius,
        targetRadius: borderTargetRadius,
        velocity: borderVelocity,
        maxRadius: borderMaxRadius,
        minRadius: borderMinRadius,
      },
      playerBlobs,
      otherBlobs,
      pellets,
      ejectedMass,
      bullets,
      viruses,
      hud: {
        currentMass,
        spawnMass,
        payoutEstimate: 0,
        exitHoldProgress,
        dashCooldownTicks: localNode?.dashCooldownTicks ?? 0,
        shootChargeRatio: localNode?.shootChargeRatio ?? 0,
        shootRecoveryTicks: localNode?.shootRecoveryTicks ?? 0,
        stunTicks: localNode?.stunTicks ?? 0,
        slowTicks: localNode?.slowTicks ?? 0,
        exitCombatTagTicks: localNode?.exitCombatTagTicks ?? 0,
        pnlPct,
        pnlUsd,
        events,
        transactions,
        localUsdWorth: massToUsd(currentMass, massPerEth, ethUsd),
        localEthWorth: massToEth(currentMass, massPerEth),
        leaderboard,
      },
    }
  }

  return { getViewModel, controller }
}
