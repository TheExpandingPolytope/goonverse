/**
 * Game configuration constants
 * 
 * MONEY VALUES ARE IN CENTS (integer math for precision)
 * $1.00 = 100 cents
 * Display: cents / 100
 */

// ═══════════════════════════════════════════════════════════════════
// COLOR PALETTE - Minimal 4-Color Theme
// ═══════════════════════════════════════════════════════════════════
// 
// Philosophy: 3 semantic colors + neutrals
// - GREEN = Player, Money, Success, Collectibles
// - RED = Enemies, Danger, Damage
// - GOLD = Warning states (stun, charging)
// - WHITE/GRAY = UI, text, subtle elements
//
export const COLORS = {
    // === PRIMARY: Money/Player/Success ===
    primary: '#4ade80',        // Soft mint green
    primaryDark: '#22c55e',
    primaryGlow: 'rgba(74, 222, 128, 0.4)',
    
    // === DANGER: Enemies/Damage/Loss ===
    danger: '#fb7185',         // Soft rose pink (less harsh than pure red)
    dangerDark: '#e11d48',
    dangerGlow: 'rgba(251, 113, 133, 0.4)',
    dangerOverlay: 'rgba(251, 113, 133, 0.12)',
    
    // === WARNING: Stun/Charging/Caution ===
    warning: '#fcd34d',        // Soft gold
    warningDark: '#f59e0b',
    
    // === NEUTRALS ===
    white: '#ffffff',
    gray: '#64748b',
    grayLight: '#94a3b8',
    grayDark: '#334155',
    
    // === BACKGROUND ===
    bg: '#0f0f14',             // Very dark (almost black)
    bgLight: '#1a1a24',        // Slightly lighter for elements
    
    // === OBSTACLES - Soft pastels that pop on dark background ===
    obstacle: '#374151',       // Fallback dark gray
    obstacleBorder: '#4b5563',
};

// Theme-matched entity colors (no PFPS)
export const ENTITY_HUES = [165, 190, 215, 250, 280, 310, 30, 55, 90, 120];

// Soft pastel colors for obstacles (work well with #0f0f14 background)
export const OBSTACLE_COLORS = [
    { fill: 'hsl(270, 35%, 55%)', border: 'hsl(270, 35%, 35%)' },  // Soft lavender
    { fill: 'hsl(180, 35%, 50%)', border: 'hsl(180, 35%, 30%)' },  // Soft teal
    { fill: 'hsl(340, 40%, 60%)', border: 'hsl(340, 40%, 40%)' },  // Soft rose
    { fill: 'hsl(200, 45%, 55%)', border: 'hsl(200, 45%, 35%)' },  // Soft sky blue
    { fill: 'hsl(45, 50%, 60%)', border: 'hsl(45, 50%, 40%)' },    // Soft amber
    { fill: 'hsl(160, 35%, 50%)', border: 'hsl(160, 35%, 30%)' },  // Soft seafoam
];

// ═══════════════════════════════════════════════════════════════════
// ECONOMY SCALING
// ═══════════════════════════════════════════════════════════════════
// Design goal: gameplay should feel the same at $1 stake vs $100 stake.
// We achieve this by expressing money knobs as *fractions of the stake*.
//
// "Stake" = entry fee = starting balance per run.
const STAKE_CENTS = 100; // $1.00 (launch default)
const stake = STAKE_CENTS;
const stakeMult = (mult, { min = 0, round = 'round' } = {}) => {
    const v = stake * mult;
    const r = round === 'floor' ? Math.floor(v) : (round === 'ceil' ? Math.ceil(v) : Math.round(v));
    return Math.max(min, r);
};
// Fixed-point helper: represent a fraction as numerator/denominator to avoid float drift.
const stakeFrac = (num, den, { min = 0 } = {}) => {
    return Math.max(min, Math.floor((stake * num) / den));
};

// Session pacing target (used for passive economy knobs)
const TARGET_SESSION_MINUTES = 8; // Aim for ~5-10 min sessions; tune this knob
const BASE_SESSION_MINUTES = 8;
const sessionScale = BASE_SESSION_MINUTES / TARGET_SESSION_MINUTES; // >1 = faster, <1 = slower

// ═══════════════════════════════════════════════════════════════════
// WORLD / POPULATION SCALING (DYNAMIC)
// ═══════════════════════════════════════════════════════════════════
// Design goal: the playable arena expands/contracts with players in world.
// Border is a circle with radius chosen so a player tends to see ~K players in view.
//
// Target in-view density:
//   E[players in view] ≈ N * (R_view^2 / R_border^2)  ->  R_border = R_view * sqrt(N / K)
//
// Where:
// - N = playersInWorld (dynamic, server-authoritative later)
// - K = playersInViewTarget (design knob)
// - R_view = effectiveViewRadiusWorld (calibration knob; see WORLD_MAP_100CCU_PLAN.md)
//
// NOTE: In this PoC, playersInWorld == (player + bots). In production it's real players.
// Tighter arena for more action
const playersInViewTarget = 2.0; // K - more players visible = more action
const maxCCU = 100;              // Cap for scaling functions
const effectiveViewRadiusWorld = 1000; // R_view (world units) - tighter view
const densityFactor = 1.6;       // Denser arena (was 2.8)

// Border dynamics (physics, not visual lerp)
// Tick-based: max radius delta per tick (world-units/tick)
// At 20 tps, 35 units/tick ≈ 700 units/sec.
const borderChangeSpeedPerTick = 5;
const borderBounceRetention = 0.25;  // velocity retention on border collision

// Entity spawn safety (bots)
const botSpawnMinIntervalTicks = 6;     // Min ticks between any bot spawns (prevents burst spawning)
const botRespawnDelayTicks = 40;        // Delay before a dead bot can respawn (2s @ 20tps)
const botSpawnMinDistancePadding = 40;  // Extra padding beyond radii to avoid overlap
const botSpawnMinDistFromPlayer = 200;  // Minimum distance from the human player (smaller world)
const botSpawnAttempts = 80;            // Attempts to find a valid spawn point
const botSpawnRadiusMinFrac = 0.25;     // Spawn ring min radius as fraction of current border radius
const botSpawnRadiusMaxFrac = 0.80;     // Spawn ring max radius as fraction of current border radius
const botSpawnBorderSlack = 80;         // Only spawn if border is within this many units of its target

    // Pellet density scaling (computed from playersInWorld at runtime)
    const minPelletsFloor = 12;
    const maxPelletsFloor = 22;
    const pelletsPerPlayerMin = 1.0; // additional pellets per player (beyond floor)
    const pelletsPerPlayerMax = 2.0;

    // Values that depend on stake
    // pelletValue: Lowered to 0.5% stake (10 cents at $20) for frequent spawns
    const pelletValue = stakeMult(0.005, { min: 1 }); 
    
    // Pellet radius scaling (smaller, value-based)
    const pelletRadiusMin = 10;  // Minimum pellet size (bigger for visibility)
    const pelletRadiusMax = 20;  // Maximum pellet size
    
    // Passive Profit Cap Settings
    // Target: Leak X% of reserves over T seconds as PASSIVE profit
    const passiveProfitCapPct = 0.05; // 5%
    const passiveProfitTimeSec = 10; // 10 seconds

    // Passive pellet flow (kept low): fraction of stake per player over a full session, from pellets
    const pelletPassiveShareOfStakePerSession = 0.20; // 20% of stake over targetSessionMinutes

    export const CONFIG = {
        // Entry/Exit
    entryFee: stake,          // Stake (cents)
    startBalance: stake,      // Same as entry fee
    exitDurationTicks: 60,    // 3 seconds at 20 ticks/sec to cash out
    // Exit fairness (damage rewinds progress instead of hard-cancel)
    // Example: 10% of stake damage rewinds ~1 tick of exit progress
    // Rewind scale: 10% of stake damage rewinds ~1 tick
    exitHitRewindCentsPerTick: stakeMult(0.10, { min: 1 }),
    exitHitRewindMaxTicks: 20, // cap rewind per hit (20 ticks = 1s)
    // Exit beacon (contestability) - range scales with wealth via radius
    exitBeaconBaseRange: 450,
    exitBeaconRangePerRadius: 7,
    minBalance: stakeMult(0.025, { min: 1 }),        // 2.5% of stake (floor)
    executeThreshold: stakeMult(0.75, { min: 1 }),   // 75% of stake
    executeMinDamageCents: stakeMult(0.10, { min: 1 }), // 10% stake hit required for "EXECUTED!"
    
    // World
    // Population sizing inputs (dynamic border uses playersInWorld at runtime)
    playersInViewTarget,
    maxCCU,
    effectiveViewRadiusWorld,
    densityFactor,
    borderChangeSpeedPerTick,
    borderBounceRetention,
    botSpawnMinIntervalTicks,
    botRespawnDelayTicks,
    botSpawnMinDistancePadding,
    botSpawnMinDistFromPlayer,
    botSpawnAttempts,
    botSpawnRadiusMinFrac,
    botSpawnRadiusMaxFrac,
    botSpawnBorderSlack,
    // Derived max world size (for obstacle placement / max extents)
    worldRadiusMax: Math.round(effectiveViewRadiusWorld * Math.sqrt(maxCCU / Math.max(0.5, playersInViewTarget)) * densityFactor),
    worldRadiusMin: 700, // tighter world for more encounters
    worldSize: Math.round(
        (effectiveViewRadiusWorld * Math.sqrt(maxCCU / Math.max(0.5, playersInViewTarget)) * densityFactor) * 2
    ), // max diameter (used for obstacle placement extents)

    radiusAtStake: 48,        // Radius when balance == stake (bigger entities - diep.io scale)
    maxEntities: 5,           // Max players + bots in world

    // Balance → size curve (helps prevent "small is strictly stronger")
    // radius ≈ (stakeUnits ^ radiusExponent) * radiusAtStake, clamped
    radiusExponent: 0.5,      // 0.5 = sqrt; lower compresses extremes
    radiusMin: 22,            // Lower floor for more satisfying size shrink on damage
    radiusMax: 110,

    // Mobility curve (bounded): small gets a modest boost, big gets a modest penalty
    mobilityRadiusRef: 36,    // Reference radius (roughly a 1x-stake player)
    mobilityExponent: 0.6,
    mobilityMin: 0.85,
    mobilityMax: 1.15,

    // Obstacles (static at world creation; border expansion reveals more)
    obstaclesPerPlayerAtMax: 0.6,
    obstacleCountMin: 18,
    obstacleCountMax: 300,
    obstacleSpawnCenterBiasExp: 1.5, // >1 biases toward center so small lobbies still have obstacles
    obstacleSpawnMinDistFromCenter: 200,
    obstacleSpawnPadding: 40,
    obstacleSpawnMaxRadiusFrac: 0.90,
    obstacleCount: Math.max(
        18,
        Math.min(
            300,
            Math.round(maxCCU * 0.6)
        )
    ),
    obstacleMinSize: 40,
    obstacleMaxSize: 200,

    // View Settings (diep.io scale - player prominent on screen)
    zoomBase: 1.4,
    zoomMin: 0.8,

    // Economy & Tax
    // - Wealth tax is % of taxable base (scale invariant).
    // - Base tax uses fixed-point scaling so it behaves similarly at $1 vs $100 stakes.
    baseTaxPerSecNumerator: 3,   // At $20 stake: 3 cents/sec (since 2000 * 3 / 2000 = 3)
    baseTaxPerSecDenom: 2000,
    wealthTaxRate: 1.0,          // % rate applied to taxable base (see wealthTaxProfitOnly)
    wealthTaxProfitOnly: true, // If true, wealth tax applies to max(0, balance - startBalance)

    // Physics (per-second values, applied with delta time)
    frictionPerSec: 0.04,     // Slightly less floaty
    accelPerSec: 12.0,        // Lower accel for "heavy" feel at low speeds
    maxSpeedBase: 2.8,        // Slow, deliberate movement
    speedDragPerSec: 0.85,    // Speed cap drag
    
    // Damage Slow Effect
    damageSlowMult: 0.6,      // 60% speed when hit (40% slow)
    slowDurationTicks: 20,    // 1 second slow

    // Shooting costs (fractions of stake) - scales with charge
    shootMinCost: stakeMult(0.005, { min: 1 }),  // 0.5% stake (10¢ at $20) - quick tap
    shootMaxCost: stakeMult(0.025, { min: 1 }),  // 2.5% stake (50¢ at $20) - full charge
    shootChargeTimeMs: 1200,  // Max charge time in ms

    // Dash costs (fractions of stake) - scales with charge
    dashMinCost: stakeMult(0.01, { min: 1 }),   // 1% stake (20¢ at $20) - quick tap
    dashMaxCost: stakeMult(0.05, { min: 1 }),   // 5% stake ($1.00 at $20) - full charge

    // ═══════════════════════════════════════════════════════════════════
    // COMBAT (BALANCE SYSTEM)
    // Damage reduces balance directly.
    // 80% of damage is spilled as loot, 20% is burned to reserve.
    // ═══════════════════════════════════════════════════════════════════
    exitCombatTagTicks: 80,        // blocks cashout progress after taking damage (~4s @ 20tps)
    
    // Spill ejection (drops from damage)
    spillEjectDistMin: 60,         // Minimum spawn distance from victim
    spillEjectDistMax: 100,        // Maximum spawn distance from victim
    spillEjectSpeedMin: 6,         // Minimum initial velocity
    spillEjectSpeedMax: 10,        // Maximum initial velocity
    spillEjectConeDeg: 45,         // Spray cone width in degrees (±half)
    
    // Damage scaling: percentage of stake
    // At $20 stake: 10% = $2.00, 25% = $5.00
    bulletDamageMinPct: 0.10,      // 10% of stake (tap shot)
    bulletDamageMaxPct: 0.25,      // 25% of stake (full charge)

    // Dash physics (REDUCED for tighter control)
    dashBaseForce: 8,         // Was 15 - now shorter dash
    dashMaxForce: 20,         // Was 45 - now shorter max dash
    dashBounceRetention: 0.6, // Momentum retained after bounce (0.6 = 60%)
    dashFrictionMult: 3.0,    // Extra friction after bounce to stop faster

    // Damage multipliers (legacy; HP combat now)
    spillRatioMin: 8.0, // Unused
    spillRatioMax: 8.0, // Unused

    // Combat physics
    bulletSpeedMult: 4.5,         // ~1.5x base speed (snappy but dodging is possible)
    // Bullet velocity inheritance (bullets inherit some of shooter's velocity)
    bulletVelocityInherit: 0.25,  // 25% - less inheritance = more consistent
    // Bullet speed scaling by charge (uncharged = slower, charged = faster)
    bulletSpeedMinMult: 0.7,      // Tap shots noticeably slower
    bulletSpeedMaxMult: 1.4,      // Charged shots feel powerful
    bulletSpeedCurve: 1.2,
    
    // Recoil (anti-spam: each shot pushes you back)
    shootRecoilBase: 1.5,         // Base recoil force
    shootRecoilChargeScale: 2.0,  // Additional recoil at full charge
    
    // Shooting commitment (makes shooting a tactical choice)
    shootChargeMoveMult: 0.8,     // Movement multiplier while charging (80% speed - high mobility)
    shootVelocityCut: 0.85,       // Instant velocity reduction on shoot (keep 85%)
    shootRecoveryMoveMult: 0.8,   // Movement multiplier during recovery (80% speed)

    // Hit effects
    entityFlashDuration: 150, // ms for entity flash effect

    // Economy - Pellets / Revenue-Gated Emission
    // Burns → Reserve (and tracked as revenue)
    // Spawns ← Limited by recent revenue (prevents draining seed)
    pelletValue,
    pelletRadiusMin,
    pelletRadiusMax,
    maxPelletValueInWorld: pelletValue * maxPelletsFloor,

    // World Economy (Bootstrap)
    initialReserve: 1000, // 1000 cents = $10.00 (bootstrap)
    
    // Passive Profit Params
    passiveProfitCapPct,
    passiveProfitTimeSec,

    minReserveToSpawn: stakeMult(0.05, { min: 1 }), // Don't spawn if reserve nearly empty

    // Hard caps for performance (not economy)
    minPellets: 0,  // No fallback floor (replaced by seed trickle)
    maxPellets: maxPelletsFloor,
    minPelletsFloor,
    maxPelletsFloor,
    pelletsPerPlayerMin,
    pelletsPerPlayerMax,
    
    // Legacy / Unused by new Valve system (kept to avoid breakages if referenced)
    pelletPassiveShareOfStakePerSession,
    maxPelletValueInWorld: pelletValue * maxPelletsFloor,
    targetSessionMinutes: TARGET_SESSION_MINUTES,
    pelletSpawnIntervalTicks: Math.max(10, Math.round(20 * (TARGET_SESSION_MINUTES / BASE_SESSION_MINUTES))), // Check valve every ~1s
    pelletMaxSpawnsPerInterval: Math.max(1, Math.round(2 * sessionScale)), 
    reserveSpawnChance: 0.05 * sessionScale,     
    pelletSpawnReserveThreshold: stake, 
    
    pelletSpawnBorderMargin: 220, // Avoid spawning near world border (safe farming)
    pelletSpawnCenterBiasExp: 2.2, // >1 biases spawns toward center (more contest)
    pelletSpawnMaxRadiusFrac: 0.70, // Slightly wider distribution (medium-sparse maps)
    pelletSpawnMinDistFromPlayers: 300, // Don't spawn right on top of players/bots
    pelletSpawnMinDistFromPellets: 70, // Prevent clumps; helps "diep/slither" spread
    
    // Collection
    magnetStrength: 0.5,      // How fast pellets/spills are pulled toward player
    magnetRange: 30,          // Extra pickup range beyond entity radius
    
    // Attacker magnet boost (reward for dealing damage)
    magnetBoostMult: 2.5,     // Magnetism multiplier after dealing damage (2.5x)
    magnetBoostRange: 80,     // Extra range during boost

    // Spill pickup readability
    spillPickupDelayTicks: 4, // Spills can't be collected for the first N ticks (prevents instant invisible pickups)

    // Initial world reserve (bootstrap liquidity)
    // $0.10 = 10 cents to start the economy
    initialReserve: 100, // 100 cents = $1.00 for bootstrapping
    
    // Visual settings
    trailLength: 8,           // How many history points for trails
    particlesPerEvent: 6,     // Max particles per event (reduced)
};

/**
 * Avatar URLs for players and bots
 */
export const AVATARS = [
    'https://i.pravatar.cc/150?img=1', 'https://i.pravatar.cc/150?img=2',
    'https://i.pravatar.cc/150?img=3', 'https://i.pravatar.cc/150?img=4',
    'https://i.pravatar.cc/150?img=5', 'https://i.pravatar.cc/150?img=8',
    'https://i.pravatar.cc/150?img=9', 'https://i.pravatar.cc/150?img=11',
    'https://i.pravatar.cc/150?img=12', 'https://i.pravatar.cc/150?img=33',
    'https://i.pravatar.cc/150?img=59', 'https://i.pravatar.cc/150?img=60'
];

export const PLAYER_AVATAR = 'https://i.pravatar.cc/150?img=68';

/**
 * Format cents to display string
 * @param {number} cents - Amount in cents
 * @returns {string} Formatted string like "$1.00"
 */
export function formatMoney(cents) {
    return '$' + (cents / 100).toFixed(2);
}

/**
 * Format cents to short display (no $ prefix)
 * @param {number} cents - Amount in cents
 * @returns {string} Formatted string like "1.00"
 */
export function formatMoneyValue(cents) {
    return (cents / 100).toFixed(2);
}

// ═══════════════════════════════════════════════════════════════════
// Dynamic helpers (used by simulation)
// ═══════════════════════════════════════════════════════════════════
export function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

/**
 * Target border radius (circle) for current players in world.
 * Physics uses this as the goal and moves toward it at `CONFIG.borderChangeSpeedPerTick`.
 */
export function getTargetBorderRadius(playersInWorld) {
    const n = clamp(playersInWorld ?? 1, 1, CONFIG.maxCCU);
    const k = Math.max(0.5, CONFIG.playersInViewTarget);
    const rView = Math.max(200, CONFIG.effectiveViewRadiusWorld);
    const raw = rView * Math.sqrt(n / k) * CONFIG.densityFactor;
    return clamp(raw, CONFIG.worldRadiusMin, CONFIG.worldRadiusMax);
}

/**
 * Dynamic pellet caps from players in world (keeps passive value supplemental).
 */
export function getDynamicPelletCaps(playersInWorld) {
    const n = clamp(playersInWorld ?? 1, 1, CONFIG.maxCCU);
    const minPellets = Math.max(CONFIG.minPelletsFloor, Math.round(n * CONFIG.pelletsPerPlayerMin));
    const maxPelletsRaw = Math.max(CONFIG.maxPelletsFloor, Math.round(n * CONFIG.pelletsPerPlayerMax));
    const maxPellets = Math.max(minPellets + 4, maxPelletsRaw);
    return {
        minPellets,
        maxPellets,
        maxPelletValueInWorld: CONFIG.pelletValue * maxPellets
    };
}
