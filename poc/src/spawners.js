/**
 * Entity spawning functions
 * Balance values in CENTS
 */
import { state, getPlayer, width } from './state.js';
import { CONFIG } from './config.js';
import { Entity } from './entities/Entity.js';
import { Obstacle } from './entities/Obstacle.js';

export function spawnDecorations() {
    // Visual-only background shapes. Keep count modest for perf.
    const count = 28;
    const maxR = (CONFIG.worldRadiusMax ?? (CONFIG.worldSize / 2)) * 0.95;
    state.decoShapes = [];

    for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * maxR;
        const x = Math.cos(ang) * rr;
        const y = Math.sin(ang) * rr;
        const size = 120 + Math.random() * 420;
        const shapes = ['circle', 'triangle', 'square', 'pentagon', 'hexagon', 'octagon'];
        const shape = shapes[Math.floor(Math.random() * shapes.length)];
        const sides =
            shape === 'triangle' ? 3 :
            shape === 'square' ? 4 :
            shape === 'pentagon' ? 5 :
            shape === 'hexagon' ? 6 :
            shape === 'octagon' ? 8 :
            0;
        let w = 0, h = 0;
        if (shape === 'square') {
            const side = size * 1.2;
            w = side;
            h = side;
        }
        const hue = (i * 37 + Math.random() * 40) % 360;
        state.decoShapes.push({
            x, y,
            shape,
            size,
            sides,
            w, h,
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.0015, // very slow
            color: `hsla(${hue}, 40%, 30%, 0.06)`,
            outline: `hsla(${hue}, 40%, 20%, 0.10)`
        });
    }
}

/**
 * Spawn world obstacles
 */
export function spawnObstacles() {
    for (let i = 0; i < CONFIG.obstacleCount; i++) {
        let ok = false;
        let x, y, r;
        let tries = 0;
        // Spawn obstacles across the FULL map (static), so border expansion reveals more.
        const maxR = (CONFIG.worldRadiusMax ?? (CONFIG.worldSize / 2)) * (CONFIG.obstacleSpawnMaxRadiusFrac ?? 0.95);

        while (!ok && tries < 100) {
            tries++;
            // Center-biased spawn within a circle (fits circular border)
            const ang = Math.random() * Math.PI * 2;
            const rr = Math.pow(Math.random(), CONFIG.obstacleSpawnCenterBiasExp ?? 1.0) * maxR;
            x = Math.cos(ang) * rr;
            y = Math.sin(ang) * rr;
            r = CONFIG.obstacleMinSize + Math.random() * (CONFIG.obstacleMaxSize - CONFIG.obstacleMinSize);

            // Don't spawn near player start
            if (Math.hypot(x, y) < (CONFIG.obstacleSpawnMinDistFromCenter ?? 350)) continue;

            // Don't overlap other obstacles
            let overlapping = false;
            for (let o of state.obstacles) {
                if (Math.hypot(x - o.x, y - o.y) < r + o.radius + (CONFIG.obstacleSpawnPadding ?? 60)) {
                    overlapping = true;
                    break;
                }
            }
            if (!overlapping) ok = true;
        }

        if (ok) {
            state.obstacles.push(new Obstacle(x, y, r));
        }
    }
}

/**
 * Spawn a bot at random location
 */
export function spawnBot() {
    let x, y;
    const br = state.borderRadius || CONFIG.worldRadiusMin;
    const minR = Math.max(250, br * (CONFIG.botSpawnRadiusMinFrac ?? 0.25));
    const maxR = Math.max(minR + 150, br * (CONFIG.botSpawnRadiusMaxFrac ?? 0.75));
    const padding = CONFIG.botSpawnMinDistancePadding ?? 50;
    const minDistFromPlayer = CONFIG.botSpawnMinDistFromPlayer ?? 0;
    const attempts = CONFIG.botSpawnAttempts ?? 80;
    const player = getPlayer();

    // Bot balance: ~0.5x - 1.25x stake (keeps difficulty consistent across entry sizes)
    const balance = Math.max(
        CONFIG.minBalance + 1,
        Math.floor(CONFIG.entryFee * (0.5 + Math.random() * 0.75))
    );

    // Bot personality for exiting (assigned on spawn)
    const targetProfit = CONFIG.entryFee * (1.25 + Math.random() * 1.75); // 1.25x - 3.0x stake target balance
    const targetSessionTicks = (2 + Math.random() * 6) * 60 * 20; // 2-8 minutes (at 20 ticks/sec)
    
    // Estimate bot radius for spawn separation
    const stakeUnits = Math.max(0.05, balance / Math.max(1, CONFIG.entryFee));
    let botRadius = Math.pow(stakeUnits, CONFIG.radiusExponent) * CONFIG.radiusAtStake;
    botRadius = Math.max(CONFIG.radiusMin, Math.min(CONFIG.radiusMax, botRadius));

    for (let t = 0; t < attempts; t++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = minR + Math.random() * (maxR - minR);
        x = Math.cos(angle) * dist;
        y = Math.sin(angle) * dist;

        // Don’t spawn outside border
        if (Math.hypot(x, y) > br - botRadius - 10) continue;

        // Keep away from player
        if (player && minDistFromPlayer > 0) {
            if (Math.hypot(x - player.x, y - player.y) < minDistFromPlayer) continue;
        }

        // Avoid obstacles
        let bad = false;
        for (const o of state.obstacles) {
            if (Math.hypot(x - o.x, y - o.y) < o.radius + botRadius + 30) { bad = true; break; }
        }
        if (bad) continue;

        // Avoid other players/bots
        for (const e of state.entities) {
            if (e.dead) continue;
            if (e.type !== 'player' && e.type !== 'bot') continue;
            if (Math.hypot(x - e.x, y - e.y) < (e.radius + botRadius + padding)) { bad = true; break; }
        }
        if (bad) continue;

        const bot = new Entity(x, y, balance, 'bot');
        // Risk appetite: 0 = cautious (cash out earlier + needs more safety), 1 = risky (stays longer)
        bot.riskAppetite = Math.min(1, Math.max(0, (Math.random() + Math.random()) / 2)); // center-weighted

        // Exit targets shaped by risk
        const profitMult = 1.15 + bot.riskAppetite * 2.5; // 1.15x - 3.65x stake
        bot.targetProfit = CONFIG.entryFee * profitMult;
        bot.targetSessionTicks = (2 + bot.riskAppetite * 8) * 60 * 20; // 2-10 minutes @ 20tps
        bot.exitPatience = 0;
        bot.wantsToExit = false;
        bot.isExiting = false;
        bot.exitProgress = 0;
        state.entities.push(bot);
        return true;
    }

    return false;
}

/**
 * Spawn a food pellet
 */
export function spawnFood() {
    let x, y;
    const p = getPlayer();
    let tries = 0;
    const br = state.borderRadius || CONFIG.worldRadiusMin;
    const borderMargin = CONFIG.pelletSpawnBorderMargin ?? 0;

    while (tries < 40) {
        tries++;

        // Center-biased spawn (reduces safe edge farming)
        const maxR = Math.max(1, (br - borderMargin) * (CONFIG.pelletSpawnMaxRadiusFrac ?? 1));
        const ang = Math.random() * Math.PI * 2;
        const u = Math.random();
        const biasExp = Math.max(0.8, CONFIG.pelletSpawnCenterBiasExp ?? 1.0);
        const r = maxR * Math.pow(u, biasExp);
        x = Math.cos(ang) * r;
        y = Math.sin(ang) * r;

        // Hard border clamp (safety) - circle
        const d0 = Math.hypot(x, y);
        const maxD = Math.max(10, br - 8);
        if (d0 > maxD) {
            x = (x / d0) * maxD;
            y = (y / d0) * maxD;
        }

        let valid = true;
        for (let o of state.obstacles) {
            if (Math.hypot(x - o.x, y - o.y) < o.radius + 18) {
                valid = false;
                break;
            }
        }
        if (!valid) continue;

        // Don't spawn right on top of any player/bot (prevents instant +PnL)
        const minDist = CONFIG.pelletSpawnMinDistFromPlayers ?? 0;
        if (minDist > 0) {
            let tooClose = false;
            for (const e of state.entities) {
                if (e.type !== 'player' && e.type !== 'bot') continue;
                if (Math.hypot(x - e.x, y - e.y) < minDist) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;
        }

        // Don't cluster pellets
        const pelletMinDist = CONFIG.pelletSpawnMinDistFromPellets ?? 0;
        if (pelletMinDist > 0) {
            let tooClose = false;
            for (const e of state.entities) {
                if (e.dead) continue;
                if (e.type !== 'food') continue;
                if (Math.hypot(x - e.x, y - e.y) < pelletMinDist) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;
        }

        if (p) {
            const d = Math.hypot(x - p.x, y - p.y);
            if (d > (width || 800) / 2) break;
        } else {
            break;
        }
    }

    // Pellet value in cents
    const e = new Entity(x, y, CONFIG.pelletValue, 'food');
    state.entities.push(e);
}

/**
 * Ensure minimum pellet count
 */
export function ensurePellets({
    minPellets = CONFIG.minPellets,
    maxPellets = (CONFIG.maxPellets ?? CONFIG.minPellets),
    maxPelletValueInWorld = CONFIG.maxPelletValueInWorld,
    budget = (CONFIG.pelletMaxSpawnsPerInterval ?? Infinity),
    force = false
} = {}) {
    const count = state.entities.filter(e => e.type === 'food').length;
    const cappedMin = Math.min(minPellets, maxPellets);
    let needed = cappedMin - count;
    let remaining = force ? Infinity : budget;
    while (needed > 0 && remaining > 0) {
        // Conservation: pellets must be funded by world reserve (no minting)
        if (state.worldReserve < CONFIG.pelletValue) break;
        // Hard caps: do not exceed pellet caps
        const foodEntities = state.entities.filter(e => e.type === 'food');
        const foodCount = foodEntities.length;
        const foodValue = foodEntities.reduce((sum, e) => sum + (e.balance || 0), 0);
        if (foodCount >= maxPellets) break;
        if (foodValue >= maxPelletValueInWorld) break;
        state.worldReserve -= CONFIG.pelletValue;
        spawnFood();
        needed--;
        remaining--;
    }
}

/**
 * Spawn spilled money from damage
 * CONSOLIDATED: 1-3 big drops instead of many tiny ones
 * 
 * @param {number} x - X position (impact point)
 * @param {number} y - Y position (impact point)
 * @param {number} total - Total amount in CENTS
 * @param {number} ownerId - ID of entity who caused the spill
 * @param {number} directionAngle - Direction to spray (radians, away from attacker)
 */
export function spawnSpill(x, y, total, ownerId, directionAngle = null) {
    if (total <= 0) return;
    
    // CONSOLIDATED: 1-3 big drops based on total value
    // 0-25% stake = 1 drop, 25-75% stake = 2 drops, 75%+ stake = 3 drops
    const t1 = Math.max(1, Math.floor(CONFIG.entryFee * 0.25));
    const t2 = Math.max(2, Math.floor(CONFIG.entryFee * 0.75));
    let count;
    if (total < t1) count = 1;
    else if (total < t2) count = 2;
    else count = 3;
    
    const valPer = Math.floor(total / count);
    let remainder = total - (valPer * count);

    const owner = ownerId ? state.entities.find(e => e.id === ownerId) : null;
    
    // Ejection config
    const distMin = CONFIG.spillEjectDistMin ?? 60;
    const distMax = CONFIG.spillEjectDistMax ?? 100;
    const speedMin = CONFIG.spillEjectSpeedMin ?? 6;
    const speedMax = CONFIG.spillEjectSpeedMax ?? 10;
    const coneDeg = CONFIG.spillEjectConeDeg ?? 45;
    const coneRad = (coneDeg / 180) * Math.PI; // Convert to radians (full cone width)

    for (let i = 0; i < count; i++) {
        let angle;
        if (directionAngle !== null) {
            // Spray in a cone toward the attacker (configurable width)
            const spread = (Math.random() - 0.5) * coneRad;
            angle = directionAngle + spread;
        } else {
            // Fallback to random 360° if no direction specified
            angle = Math.random() * Math.PI * 2;
        }
        
        // Conservation: distribute remainder (no cents lost to flooring)
        const val = valPer + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        
        // Spawn offset from victim position (farther away)
        const ejectDist = distMin + Math.random() * (distMax - distMin);
        const spawnX = x + Math.cos(angle) * ejectDist;
        const spawnY = y + Math.sin(angle) * ejectDist;
        
        const e = new Entity(spawnX, spawnY, val, 'spill', ownerId);
        
        // Initial velocity (faster ejection)
        const speed = speedMin + Math.random() * (speedMax - speedMin);
        e.vx = Math.cos(angle) * speed;
        e.vy = Math.sin(angle) * speed;

        state.entities.push(e);
    }
}
