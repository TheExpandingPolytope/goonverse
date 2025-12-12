import type { RoomSummary } from '@/types/rooms'

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
  color: string
  isLocal: boolean
  isExiting: boolean
  exitProgress: number // 0-1
  exitRadius: number // already-shrunk radius for rendering while exiting
}

export type PelletView = {
  x: number
  y: number
  radius: number
  color: string
}

export type EjectedMassView = {
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
  hud: {
    currentMass: number
    spawnMass: number
    payoutEstimate: number
    exitHoldProgress: number // 0-1
    pingMs?: number
    serverLabel?: string
  }
}

// Controller interface used by the input layer. World.tsx wires this up
// to keyboard/mouse events via attachInputListeners().
export type WorldInputController = {
  onPointerMove: (pos: { x: number; y: number }) => void
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
}

export type CreateWorldAdapterOptions = {
  getStateSnapshot: () => ServerGameState | null
  sendInput: (input: ClientInputMessage) => void
  sessionId: string | null
}

export const createWorldAdapter = ({
  getStateSnapshot,
  sendInput,
  sessionId,
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

    state.players.forEach((player: ServerPlayer) => {
      if (!player.isAlive) return

      const isLocal = sessionId != null && player.sessionId === sessionId
      if (isLocal) {
        localPlayer = player
      }

      player.blobs.forEach((blob: ServerBlob) => {
        const base: BlobView = {
          id: blob.id,
          x: blob.x,
          y: blob.y,
          radius: blob.radius,
          color: `hsl(${player.color * 30}, 80%, 60%)`,
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

    state.pellets.forEach((p: ServerPellet) => {
      pellets.push({
        x: p.x,
        y: p.y,
        radius: p.radius,
        color: `hsl(${p.color * 40}, 80%, 60%)`,
      })
    })

    state.ejectedMass.forEach((m: ServerEjectedMass) => {
      ejectedMass.push({
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

    if (localPlayer) {
      let totalMass = 0
      let sumX = 0
      let sumY = 0

      ;(localPlayer as ServerPlayer).blobs.forEach((blob: ServerBlob) => {
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

      // Very simple zoom rule: smaller mass → zoom in, larger mass → zoom out
      const MASS_ZOOM_BASE = 0.9
      const MASS_ZOOM_MIN = 0.5
      const MASS_ZOOM_MAX = 1.4
      const massFactor = Math.max(1, Math.log10(currentMass + 10))
      zoom = Math.min(MASS_ZOOM_MAX, Math.max(MASS_ZOOM_MIN, MASS_ZOOM_BASE / massFactor))

      // Exit progress: use the maximum blob exit progress
      ;(localPlayer as ServerPlayer).blobs.forEach((blob: ServerBlob) => {
        if (blob.exitProgress != null) {
          exitHoldProgress = Math.max(exitHoldProgress, blob.exitProgress)
        }
      })
    }

    return {
      camera: { x: cameraX, y: cameraY, zoom },
      world: { width: worldWidth, height: worldHeight },
      playerBlobs,
      otherBlobs,
      pellets,
      ejectedMass,
      hud: {
        currentMass,
        spawnMass,
        payoutEstimate: 0, // filled in later when economy wiring is ready
        exitHoldProgress,
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
    console.log("state", state);
    if (!state) return null
    return buildViewModel(state)
  }

  return { getViewModel, controller }
}
