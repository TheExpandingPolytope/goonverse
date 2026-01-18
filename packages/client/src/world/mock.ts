import type { WorldViewModel } from './adapters'

type Rng = () => number

function createRng(seed: number): Rng {
  // Simple LCG for stable pseudo-random values (deterministic across sessions).
  let s = seed >>> 0
  return () => {
    s = (1664525 * s + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

const PELLET_COLORS = ['#EC407A', '#4A90E2', '#50E3C2', '#F5A623', '#7ED321', '#9B59B6'] as const
const BLOB_COLORS = ['#EC407A', '#4A90E2', '#50E3C2', '#F5A623', '#7ED321'] as const

type MockPellet = { id: string; a: number; b: number; r: number; phase: number; color: string; usdValue: number }
type MockBlob = {
  id: string
  baseR: number
  orbitR: number
  speed: number
  phase: number
  color: string
  name: string
  usdValue: number
}
type MockVirus = { id: string; orbitR: number; phase: number }

export function createMockViewModelSource(): () => WorldViewModel {
  const rng = createRng(1337)

  const pellets: MockPellet[] = Array.from({ length: 80 }, (_, i) => ({
    id: `pellet-${i}`,
    a: rng() * Math.PI * 2,
    b: rng() * Math.PI * 2,
    r: 700 + rng() * 900,
    phase: rng() * Math.PI * 2,
    color: PELLET_COLORS[Math.floor(rng() * PELLET_COLORS.length)]!,
    usdValue: 0.01 + rng() * 0.05,
  }))

  const other: MockBlob[] = Array.from({ length: 15 }, (_, i) => ({
    id: `other-${i}`,
    baseR: 30 + rng() * 60,
    orbitR: 450 + rng() * 700,
    speed: 0.08 + rng() * 0.12,
    phase: rng() * Math.PI * 2,
    color: BLOB_COLORS[i % BLOB_COLORS.length]!,
    name: ['Alice', 'Bob', 'Charlie', 'Dana', 'Eve', 'Frank', 'Grace', 'Hank', 'Ivy'][i % 9]!,
    usdValue: 5 + rng() * 50,
  }))

  const viruses: MockVirus[] = Array.from({ length: 8 }, (_, i) => ({
    id: `virus-${i}`,
    orbitR: 420 + rng() * 520,
    phase: (i / 8) * Math.PI * 2,
  }))

  return () => {
    const t = performance.now() / 1000

    // Player blob (animated)
    const playerX = Math.cos(t * 0.2) * 220
    const playerY = Math.sin(t * 0.2) * 220

    const playerBlobs: WorldViewModel['playerBlobs'] = [
      {
        id: 'player-0',
        x: playerX,
        y: playerY,
        radius: 50,
        mass: 850,
        color: '#22c55e',
        displayName: 'Player',
        usdValue: 25.5,
        isLocal: true,
        isExiting: false,
        exitProgress: 0,
        exitRadius: 0,
        vx: 0,
        vy: 0,
        aimX: playerX + 80,
        aimY: playerY,
        dashChargeRatio: 0,
        shootChargeRatio: 0,
        dashCooldownTicks: 0,
        dashActiveTicks: 0,
        stunTicks: 0,
        slowTicks: 0,
        shootRecoveryTicks: 0,
        exitCombatTagTicks: 0,
        hitFlashTicks: 0,
      },
    ]

    const otherBlobs: WorldViewModel['otherBlobs'] = other.map((b, i) => {
      const x = Math.cos(b.phase + t * b.speed + i * 0.9) * b.orbitR
      const y = Math.sin(b.phase + t * b.speed + i * 0.9) * b.orbitR
      return {
        id: b.id,
        x,
        y,
        radius: b.baseR + 6 * Math.sin(t * 0.8 + i),
        mass: 200 + (i + 1) * 50,
        color: b.color,
        displayName: b.name,
        usdValue: b.usdValue,
        isLocal: false,
        isExiting: false,
        exitProgress: 0,
        exitRadius: 0,
        vx: 0,
        vy: 0,
        aimX: x + 80,
        aimY: y,
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
    })

    const pelletViews: WorldViewModel['pellets'] = pellets.map((p, i) => {
      const x = Math.cos(p.a) * p.r + Math.sin(t * 0.35 + p.phase + i) * 120
      const y = Math.sin(p.b) * p.r + Math.cos(t * 0.25 + p.phase + i) * 120
      const radius = 6 + 4 * (0.2 + (i % 7) / 10)
      return {
        id: p.id,
        x,
        y,
        radius,
        color: p.color,
        mass: 1,
        usdValue: p.usdValue,
      }
    })

    const virusViews: WorldViewModel['viruses'] = viruses.map((v, i) => ({
      id: v.id,
      x: Math.cos(v.phase + t * 0.08 + i * 0.3) * v.orbitR,
      y: Math.sin(v.phase + t * 0.08 + i * 0.3) * v.orbitR,
      radius: 40,
      color: '#00FF00',
    }))

    const leaderboard = [
      { sessionId: 'top', displayName: 'TopPlayer', usdValue: 150.25, isLocal: false },
      { sessionId: 'player', displayName: 'Player', usdValue: 25.5, isLocal: true },
      { sessionId: 'alice', displayName: 'Alice', usdValue: 45.75, isLocal: false },
      { sessionId: 'bob', displayName: 'Bob', usdValue: 38.2, isLocal: false },
      { sessionId: 'charlie', displayName: 'Charlie', usdValue: 32.1, isLocal: false },
    ].sort((a, b) => b.usdValue - a.usdValue)

    return {
      camera: {
        x: playerX,
        y: playerY,
        zoom: 0.8,
      },
      world: {
        width: 4000,
        height: 4000,
      },
      pellets: pelletViews,
      ejectedMass: [],
      bullets: [],
      viruses: virusViews,
      otherBlobs,
      playerBlobs,
      hud: {
        currentMass: 850,
        spawnMass: 200,
        payoutEstimate: 0,
        exitHoldProgress: 0,
        localUsdWorth: 25.5,
        showTopLeftStats: false,
        showBottomWorth: false,
        showLeaderboard: false,
        leaderboard,
      },
    }
  }
}


