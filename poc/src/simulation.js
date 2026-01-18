/**
 * Fixed Timestep Simulation Loop
 * 
 * Separates game logic (ticks) from rendering (frames)
 * This architecture maps directly to Colyseus server simulation
 * 
 * Server will run: tick() at TICK_RATE
 * Client will run: tick() for prediction + render() at display rate
 */

import { TICK_RATE, TICK_MS, TICK_FREQUENCY } from './tickConfig.js';
import { state, getPlayer, input } from './state.js';
import { CONFIG, getTargetBorderRadius, getDynamicPelletCaps } from './config.js';

// Delta time in seconds
const DT = TICK_MS / 1000;
import { checkCollisions } from './systems/collision.js';
import { updateShockwaves } from './systems/effects.js';
import { spawnFood, ensurePellets, spawnBot } from './spawners.js';

// Simulation state
let currentTick = 0;
let accumulator = 0;
let lastTime = 0;
let pelletSpawnCounter = 0; // ticks until next pellet economy update
let pelletSpawnCarry = 0;   // cents carry for passive pellet flow (supports fractional spawn rates)

function countPlayersInWorld() {
    return state.entities.filter(e => (e.type === 'player' || e.type === 'bot') && !e.dead).length;
}

function updateDynamicBorder() {
    const players = countPlayersInWorld();
    state.playersInWorld = players;

    const target = getTargetBorderRadius(players);
    state.borderTargetRadius = target;

    const maxDelta = (CONFIG.borderChangeSpeedPerTick ?? 0); // units per tick
    const prev = state.borderRadius ?? target;
    const delta = maxDelta > 0 ? Math.max(-maxDelta, Math.min(maxDelta, target - prev)) : (target - prev);

    state.borderRadius = prev + delta;
    state.borderVelocity = delta / DT; // units/sec
}

function processBotSpawns() {
    if (!Array.isArray(state.botSpawnQueue) || state.botSpawnQueue.length === 0) return;

    // Keep queue ordered by due tick
    state.botSpawnQueue.sort((a, b) => a - b);

    const currentCount = countPlayersInWorld();
    if (currentCount >= (CONFIG.maxEntities ?? 3)) return;

    // Enforce minimum interval between bot spawns
    if (currentTick < (state.nextBotSpawnTick ?? 0)) return;

    // Don’t spawn if border is still far behind its current target (prevents overcrowding when border expands slowly)
    const slack = CONFIG.botSpawnBorderSlack ?? 0;
    if ((state.borderRadius ?? 0) < (state.borderTargetRadius ?? 0) - slack) return;

    const due = state.botSpawnQueue[0];
    if (due > currentTick) return;

    // Attempt one spawn; if it fails, retry later
    const ok = spawnBot();
    if (ok) {
        state.botSpawnQueue.shift();
        state.nextBotSpawnTick = currentTick + (CONFIG.botSpawnMinIntervalTicks ?? 1);
    } else {
        // Back off slightly if spawn search failed
        state.botSpawnQueue[0] = currentTick + 10;
        state.nextBotSpawnTick = currentTick + (CONFIG.botSpawnMinIntervalTicks ?? 1);
    }
}

function applyBorderPhysics() {
    const br = state.borderRadius ?? CONFIG.worldRadiusMin;
    if (!br || br <= 0) return;

    const retention = CONFIG.borderBounceRetention ?? 0.25;
    const borderVelEntityUnits = (state.borderVelocity || 0) / 60; // entity vx/vy are ~units per 1/60s

    for (const e of state.entities) {
        if (e.dead) continue;
        // Keep all entities (players/bots/pickups) inside the border
        const r = Math.max(0, br - (e.radius || 0));
        const d = Math.hypot(e.x, e.y);
        if (d <= r) continue;

        // Normal from center outward
        let nx = 1, ny = 0;
        if (d > 0.0001) {
            nx = e.x / d;
            ny = e.y / d;
        }

        // Snap to border (small correction each tick as the border moves)
        e.x = nx * r;
        e.y = ny * r;

        // Bounce velocities off the border (physics, prevents instant "kick out")
        if (typeof e.vx === 'number' && typeof e.vy === 'number') {
            const dot = e.vx * nx + e.vy * ny;
            if (dot > 0) {
                e.vx = e.vx - (1 + retention) * dot * nx;
                e.vy = e.vy - (1 + retention) * dot * ny;
            }

            // If border is shrinking, add a gentle inward bias equal to border movement
            if (borderVelEntityUnits < 0) {
                e.vx += nx * borderVelEntityUnits;
                e.vy += ny * borderVelEntityUnits;
            }
        }
    }

    // Bullets outside border are removed (readability + perf)
    for (const b of state.bullets) {
        if (b.dead) continue;
        if (Math.hypot(b.x, b.y) > br + (b.radius || 0)) {
            b.dead = true;
        }
    }
}

/**
 * Get current simulation tick
 */
export function getCurrentTick() {
    return currentTick;
}

/**
 * Reset simulation state (on game restart)
 */
export function resetSimulation() {
    currentTick = 0;
    accumulator = 0;
    lastTime = performance.now();
    pelletSpawnCounter = CONFIG.pelletSpawnIntervalTicks ?? 20;
    pelletSpawnCarry = 0;
}

/**
 * Check if a system should run this tick based on frequency
 * @param {string} systemName - Key from TICK_FREQUENCY
 * @returns {boolean}
 */
export function shouldRunSystem(systemName) {
    const frequency = TICK_FREQUENCY[systemName];
    if (!frequency || frequency === 1) return true;
    return currentTick % frequency === 0;
}

/**
 * Process player input for this tick
 * In networked version, this would read from input queue
 */
function processPlayerInput() {
    const player = getPlayer();
    if (!player || player.dead || player.stunTimer > 0) return;
    
    // No movement while exiting (just slowdown)
    if (player.isExiting) {
        // Apply strong drag while exiting
        player.vx *= 0.9;
        player.vy *= 0.9;
        return;
    }
    
    // WASD movement
    let ax = 0, ay = 0;
    if (input.keys.w) ay -= 1;
    if (input.keys.s) ay += 1;
    if (input.keys.a) ax -= 1;
    if (input.keys.d) ax += 1;
    
    if (ax !== 0 || ay !== 0) {
        const len = Math.hypot(ax, ay);
        ax /= len;
        ay /= len;
        
        let speedMod = player.isChargingDash ? 0.4 : 1.0;
        if (player.slowTimer > 0) speedMod *= (CONFIG.damageSlowMult ?? 0.6);
        
        // Shooting commitment: reduced mobility while charging or recovering
        if (input.lmb && player.fireCooldown <= 0) {
            // Charging a shot - heavily reduced movement
            speedMod *= CONFIG.shootChargeMoveMult;
        } else if (player.shootRecoveryTimer > 0) {
            // Just shot - recovery period with reduced movement
            speedMod *= CONFIG.shootRecoveryMoveMult;
        }
        
        // Delta-time based acceleration
        const force = CONFIG.accelPerSec * DT * player.getMobilityMult() * speedMod;
        
        player.vx += ax * force;
        player.vy += ay * force;
    }
}

/**
 * Run economy systems (tax, pellet spawning)
 */
function tickEconomy() {
    // Tax burn (runs every TICK_FREQUENCY.taxBurn ticks)
    if (shouldRunSystem('taxBurn')) {
        state.entities.forEach(e => {
            if (e.type === 'player' || e.type === 'bot') {
                // Tax per second, applied once per taxBurn frequency
                // Base tax uses fixed-point carry so it scales smoothly at small stakes.
                const denom = CONFIG.baseTaxPerSecDenom ?? 2000;
                const num = CONFIG.baseTaxPerSecNumerator ?? 0;
                if (e.baseTaxCarry === undefined) e.baseTaxCarry = 0;
                e.baseTaxCarry += (CONFIG.entryFee * num);
                const baseTax = Math.floor(e.baseTaxCarry / denom);
                e.baseTaxCarry = e.baseTaxCarry % denom;

                const taxableBase = CONFIG.wealthTaxProfitOnly
                    ? Math.max(0, e.balance - CONFIG.startBalance)
                    : e.balance;
                const wealthTax = Math.floor(taxableBase * (CONFIG.wealthTaxRate / 100));
                const totalTax = baseTax + wealthTax;
                // Conservation: tax is transferred to world reserve (not deleted)
                const taxPaid = Math.min(totalTax, e.balance);
                e.balance -= taxPaid;
                state.worldReserve += taxPaid;
                
                // Passive Economy: Track tax as passive burn
                state.passiveReserve += taxPaid;
                state.baseBurnSinceLastSpawn += taxPaid;

                // Liquidation: if you're below the floor, remaining balance is forfeit to reserve
                if (e.balance <= CONFIG.minBalance) {
                    if (e.balance > 0) state.worldReserve += e.balance;
                    e.balance = 0;
                    e.lastDeathCause = 'burn';
                    e.die();
                }
            }
        });
    }
    
    // Pellet spawning (Leaky Bucket)
    pelletSpawnCounter--;
    if (pelletSpawnCounter <= 0) {
        const counterBeforeReset = pelletSpawnCounter;
        pelletSpawnCounter = CONFIG.pelletSpawnIntervalTicks ?? 20;

        const players = state.playersInWorld || countPlayersInWorld();
        
        // Count current pellets
        const foodEntities = state.entities.filter(e => !e.dead && e.type === 'food');
        let pelletCount = foodEntities.length;
        
        // Hard cap (performance)
        const caps = getDynamicPelletCaps(players);
        
        // Passive Economy Emission (Constant Flow + Profit Leak)
        // 1. Recycle: refund passive burn (baseBurnSinceLastSpawn)
        // 2. Leak: leak small % of passiveReserve (seed + accumulated burn)
        
        // Only run passive economy if players are present (no offline minting)
        if (players > 0) {
            const dt = (CONFIG.pelletSpawnIntervalTicks ?? 20) / 20; // seconds per check
            
            // Calculate leak rate (lambda * R)
            // lambda = -ln(1 - X) / T
            const X = CONFIG.passiveProfitCapPct ?? 0.05;
            const T = CONFIG.passiveProfitTimeSec ?? 300;
            const lambda = -Math.log(1 - X) / T;
            
            const leakRate = lambda * state.passiveReserve;
            const burnRate = state.baseBurnSinceLastSpawn / dt; // equivalent rate
            
            const totalRate = burnRate + leakRate;
            state.spawnCarry += totalRate * dt;
            
            // Reset burn accumulator
            state.baseBurnSinceLastSpawn = 0;
            
            // Spawn Loop
            const pVal = CONFIG.pelletValue;
            let spawned = 0;
            
            while (
                state.spawnCarry >= pVal && 
                state.worldReserve >= pVal && 
                pelletCount < caps.maxPellets && 
                spawned < 5 // Burst cap
            ) {
                state.worldReserve -= pVal;
                state.passiveReserve -= pVal; // Deplete passive reserve too
                state.spawnCarry -= pVal;
                spawnFood();
                pelletCount++;
                spawned++;
            }
        }
    }
}

/**
 * Single simulation tick - all deterministic game logic
 * This is what the server will run
 */
export function tick() {
    currentTick++;

    // 0. Dynamic world border (server-authoritative later)
    updateDynamicBorder();

    // 0.5 Bot spawns (tick-based pacing)
    processBotSpawns();
    
    // 1. Process inputs (player movement, dash charging handled in entity.tick())
    processPlayerInput();
    
    // 2. Update all entities (physics, timers, AI)
    state.entities.forEach(e => e.tick());

    // 2.2 Handle bot cashouts (bots can now complete exits)
    for (const e of state.entities) {
        if (e.dead) continue;
        if (e.type !== 'bot') continue;
        if (!e.exitComplete) continue;
        e.dead = true;
        // Queue a respawn credit (tick-based)
        if (Array.isArray(state.botSpawnQueue)) {
            state.botSpawnQueue.push(currentTick + (CONFIG.botRespawnDelayTicks ?? 40));
        }
    }
    
    // 3. Update bullets
    state.bullets.forEach(b => b.tick());

    // 3.5 Border physics (applies to entities + bullets)
    applyBorderPhysics();
    
    // 4. Collision detection
    if (shouldRunSystem('collision')) {
        checkCollisions();
    }
    
    // 5. Economy
    tickEconomy();
    
    // 6. Update obstacles (rotation)
    state.obstacles.forEach(o => o.tick());
    
    // 7. Cleanup dead entities
    if (shouldRunSystem('entityCleanup')) {
        state.entities = state.entities.filter(e => !e.dead);
        state.bullets = state.bullets.filter(b => !b.dead);
    }
    
    // 8. Update effects (these could be client-only, but harmless here)
    updateShockwaves();
    state.floatTexts.forEach(f => f.update());
    state.floatTexts = state.floatTexts.filter(f => f.life > 0);
    state.particles = state.particles.filter(p => p.life > 0);
}

/**
 * Fixed timestep game loop
 * Accumulates time and runs ticks at fixed rate
 * Returns interpolation alpha for smooth rendering
 * 
 * @param {number} currentTime - Current timestamp from requestAnimationFrame
 * @returns {number} Alpha value (0-1) for render interpolation
 */
export function update(currentTime) {
    if (lastTime === 0) {
        lastTime = currentTime;
        return 0;
    }
    
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;
    
    // Prevent spiral of death (cap accumulated time)
    accumulator += Math.min(deltaTime, 200);
    
    // Run simulation ticks
    while (accumulator >= TICK_MS) {
        if (state.gameState === 'playing') {
            tick();
        }
        
        accumulator -= TICK_MS;
    }
    // Return alpha for interpolation (0 = previous state, 1 = current state)
    const alpha = accumulator / TICK_MS;
    
    return alpha;
}

/**
 * Get simulation stats for debugging
 */
export function getSimulationStats() {
    return {
        currentTick,
        tickRate: TICK_RATE,
        tickMs: TICK_MS,
        entityCount: state.entities.length,
        bulletCount: state.bullets.length,
    };
}
