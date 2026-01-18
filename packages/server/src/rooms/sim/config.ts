/**
 * Shooter simulation constants (authoritative).
 *
 * These are the PoC-parity defaults described in docs/game-architecture.md.
 * Keep all gameplay numbers here so tuning is deliberate and auditable.
 */

export const SIM_CONFIG = {
  // Tick
  tickMs: 50, // 20Hz

  // Dynamic circular border (POC-style)
  border: {
    // Population sizing inputs (dynamic border uses playersInWorld at runtime)
    playersInViewTarget: 2.0, // K - more players visible = more action
    maxCCU: 100,              // Cap for scaling functions
    effectiveViewRadiusWorld: 1000, // R_view (world units)
    densityFactor: 1.6,       // Denser arena
    // Derived max world size
    worldRadiusMax: 11314,    // ~= 1000 * sqrt(100/2.0) * 1.6
    worldRadiusMin: 700,      // Tighter world for more encounters
    // Border dynamics (per-tick)
    changeSpeedPerTick: 5,    // Max radius delta per tick
    bounceRetention: 0.25,    // Velocity retention on border collision
  },

  // Fixed-point mass representation
  massScale: 10_000,
  // POC parity: "min balance" floor scales with stake; below this you are liquidated.
  // (2.5% of stake in the PoC)
  minBalancePctOfSpawn: 0.025,
  // Safety fallback (should be dominated by minBalancePctOfSpawn in normal play)
  deathFloorMass: 1,

  // Input handling
  inputStaleTicks: 4,
  reconnectGraceTicks: 200,

  // Interest management
  viewBaseRadius: 900,
  viewMinRadius: 700,
  viewMaxRadius: 1400,

  // Spatial hash
  gridCellSize: 160,

  // LOD / bandwidth caps
  lod: {
    maxNodesPerDelta: 800,
    minPickupMassForDelta: 1,
    pickupInterestRadius: 1100,
    clusterCellSize: 220,
    clusterMinCount: 4,
  },

  // Wealth -> power curve (POC parity)
  radiusExponent: 0.5,        // 0.5 = sqrt; compresses extremes
  radiusAtSpawn: 48,          // Radius when balance == stake
  radiusMin: 22,              // Lower floor for satisfying size shrink
  radiusMax: 110,
  mobilityRadiusRef: 36,      // Reference radius (roughly 1x-stake)
  mobilityExponent: 0.6,
  mobilityMin: 0.85,
  mobilityMax: 1.15,

  // Movement (per-second values, converted in systems)
  movement: {
    accelPerSec: 12.0,
    maxSpeedBase: 2.8,
    frictionPerSec: 0.04,
    speedDragPerSec: 0.85,
    exitDampMult: 0.9,
    damageSlowMult: 0.6,
    // POC parity: 1500ms @ 20tps
    slowDurationTicks: 30,
  },

  // Shooting
  shooting: {
    chargeTimeMs: 1200,
    minCostPct: 0.005,
    maxCostPct: 0.025,
    minDamagePct: 0.10,
    maxDamagePct: 0.25,
    bulletSpeedBase: 4.5,
    bulletSpeedMinMult: 0.7,
    bulletSpeedMaxMult: 1.4,
    bulletSpeedCurve: 1.2,
    // POC parity: bullets are bigger for readability (8-14)
    bulletRadiusMin: 8,
    bulletRadiusMax: 14,
    // POC parity: ~2.2s @ 20tps
    bulletTtlTicks: 44,
    velocityInherit: 0.25,
    recoilBase: 1.5,
    recoilChargeScale: 2.0,
    chargeMoveMult: 0.8,
    recoveryMoveMult: 0.8,
    velocityCut: 0.85,
    recoveryTicks: 8,
    // POC parity: show the charge ring briefly even after release
    chargeVisualTicks: 10,
    cooldownMinTicks: 8,
    cooldownMaxTicks: 16,
  },

  // Dash
  dash: {
    // POC parity: 1000ms max charge (20 ticks @ 50ms)
    chargeTimeMs: 1000,
    minCostPct: 0.01,
    maxCostPct: 0.05,
    baseForce: 8,
    maxForce: 20,
    // POC parity
    activeTicks: 10,
    cooldownTicks: 60,
    invulnTicks: 4,
    // Overheat threshold is chargeMaxTicks + overheatTicks (20 + 30 = 50)
    overheatTicks: 30,
    overheatStunTicks: 50,
    chargeMoveMult: 0.4,
    bounceRetention: 0.6,
    frictionMult: 3.0,
  },

  // Stun
  stun: {
    minTicks: 6,
    maxTicks: 40,
    perMass: 0.000002,
    perMomentum: 0.0000002,
    perMomentumDelta: 0.0000002,
    graceTicks: 8,
  },

  // Exit
  exit: {
    durationTicks: 60,
    rateMin: 0.01,
    rateRamp: 0.0008,
    rateMax: 0.03,
    progressLossPerMass: 0.0000001,
    beaconBaseRange: 450,
    beaconRangePerRadius: 7,
    safeHoldTicks: 20,
    safeRateMult: 1.25,
    combatTagTicks: 80,
  },

  // Economy / reserve
  economy: {
    baseTaxPerSecNumerator: 3,
    baseTaxPerSecDenom: 2000,
    wealthTaxRate: 0.01,
  },

  // Pellets + spills
  pellets: {
    spawnIntervalTicks: 20,
    spawnPerInterval: 4,
    pelletValuePctOfSpawn: 0.005,
    pelletRadiusMin: 10,
    pelletRadiusMax: 20,
    maxPelletValueInWorldPct: 0.10,
    magnetStrength: 0.5,
    magnetRange: 30,
    magnetBoostMult: 2.5,
    magnetBoostRange: 80,
    spillPickupDelayTicks: 4,
    spillUnlockTicks: 30,
    spillMaxPickupsPerEvent: 3,
    spillMaxPickupsPerTick: 50,
    // POC parity: ~150ms @ 20tps
    hitFlashTicks: 3,
  },

  spill: {
    ejectDistMin: 60,
    ejectDistMax: 100,
    ejectSpeedMin: 6,
    ejectSpeedMax: 10,
    ejectConeDeg: 45,
  },

  // Obstacles (POC parity)
  obstacles: {
    perPlayerAtMax: 0.6,
    countMin: 18,
    countMax: 300,
    minRadius: 40,
    maxRadius: 200,
    spawnPadding: 40,
    spawnCenterBiasExp: 1.5,    // >1 biases toward center
    spawnMinDistFromCenter: 200,
    spawnMaxRadiusFrac: 0.90,   // As fraction of border radius
    maxAttempts: 400,
    bounceRetention: 0.25,
  },

  spawnSafetyPadding: 60,
} as const;

// ═══════════════════════════════════════════════════════════════════
// Dynamic helpers (used by simulation, POC parity)
// ═══════════════════════════════════════════════════════════════════

function clampValue(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Target border radius (circle) for current players in world.
 * Physics uses this as the goal and moves toward it at border.changeSpeedPerTick.
 */
export function getTargetBorderRadius(playersInWorld: number): number {
  const n = clampValue(playersInWorld ?? 1, 1, SIM_CONFIG.border.maxCCU);
  const k = Math.max(0.5, SIM_CONFIG.border.playersInViewTarget);
  const rView = Math.max(200, SIM_CONFIG.border.effectiveViewRadiusWorld);
  const raw = rView * Math.sqrt(n / k) * SIM_CONFIG.border.densityFactor;
  return clampValue(raw, SIM_CONFIG.border.worldRadiusMin, SIM_CONFIG.border.worldRadiusMax);
}

/**
 * Dynamic obstacle count from players in world.
 */
export function getDynamicObstacleCount(playersInWorld: number): number {
  const n = clampValue(playersInWorld ?? 1, 1, SIM_CONFIG.border.maxCCU);
  return clampValue(
    Math.round(n * SIM_CONFIG.obstacles.perPlayerAtMax),
    SIM_CONFIG.obstacles.countMin,
    SIM_CONFIG.obstacles.countMax
  );
}


