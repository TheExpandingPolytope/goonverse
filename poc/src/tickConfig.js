/**
 * Tick-based timing configuration
 * All game logic runs on fixed ticks for determinism and server authority
 * 
 * When porting to Colyseus:
 * - Server runs simulation at TICK_RATE
 * - Client interpolates between received states
 * - Inputs are queued and processed at tick boundaries
 */

export const TICK_RATE = 20; // ticks per second
export const TICK_MS = 1000 / TICK_RATE; // 50ms per tick

/**
 * Frequency configuration for different game systems
 * Value = "run every N ticks"
 * 1 = every tick, 2 = every other tick, etc.
 */
export const TICK_FREQUENCY = {
    // Core physics - must run every tick for accuracy
    physics: 1,
    collision: 1,
    
    // Bot AI - can be less frequent for performance
    botTargeting: 6,      // Every 6 ticks = 300ms (target selection)
    botMovement: 1,       // Every tick (movement toward target)
    botShootDecision: 2,  // Every 2 ticks = 100ms (shoot evaluation)
    
    // Economy
    taxBurn: 20,          // Every 20 ticks = 1 second
    pelletSpawnCheck: 12, // Every 12 ticks = 600ms (slower = less passive value)
    
    // Cleanup
    entityCleanup: 1,     // Every tick (remove dead entities)
};

/**
 * Timer durations in TICKS (not milliseconds)
 * Convert: ticks = milliseconds / TICK_MS
 */
export const TIMER_TICKS = {
    // Dash system
    dashCooldown: 60,         // 3000ms = 60 ticks
    dashActiveDuration: 10,   // 500ms = 10 ticks
    dashChargeMax: 20,        // 1000ms = 20 ticks (max charge time)
    dashOverheat: 50,         // 2500ms = 50 ticks (overheat threshold)
    
    // Combat
    stunDuration: 50,         // 2500ms = 50 ticks
    invulnDuration: 4,        // 200ms = 4 ticks
    slowDuration: 30,         // 1500ms = 30 ticks
    hitFlashDuration: 3,      // ~150ms = 3 ticks
    magnetBoostDuration: 20,  // 1000ms = 20 ticks (magnet boost after dealing damage)
    
    // Shooting cooldowns (min/max based on charge)
    // Min cooldown is the spam limiter - can't fire faster than this
    fireCooldownMin: 8,       // 400ms = 8 ticks (limits spam to 2.5 shots/sec)
    fireCooldownMax: 16,      // 800ms = 16 ticks (charged shots have reasonable cooldown)
    shootRecoveryDuration: 8, // 400ms = 8 ticks (reduced mobility after shooting)
    
    // Economy
    lootOwnership: 30,        // 1500ms = 30 ticks (spill belongs to killer)
    
    // Bullets
    bulletLifetime: 44,       // 220ms * (1000/50) ≈ 4.4 ticks, round to 44 for 2200ms total travel
    
    // Spawn animation
    spawnAnimDuration: 20,    // 1 second = 20 ticks
};

/**
 * Input queue configuration (for future networking)
 * Inputs are collected between ticks and processed at tick boundary
 */
export const INPUT_CONFIG = {
    // How inputs will be handled when we add networking:
    // 1. Client captures input state each frame
    // 2. On tick boundary, input state is sent to server
    // 3. Server queues inputs and processes on next tick
    // 4. Client predicts locally for responsiveness
    // 5. Server state reconciles client prediction
    
    // For now (single-player PoC):
    // - Input is read directly at tick time
    // - No prediction/reconciliation needed yet
    
    maxInputQueueSize: 10,    // Max queued inputs per client
    inputBufferTicks: 2,      // Ticks to buffer for network jitter
};

/**
 * Helper to convert milliseconds to ticks (for dynamic calculations)
 */
export function msToTicks(ms) {
    return Math.round(ms / TICK_MS);
}

/**
 * Helper to convert ticks to milliseconds (for display/audio)
 */
export function ticksToMs(ticks) {
    return ticks * TICK_MS;
}
