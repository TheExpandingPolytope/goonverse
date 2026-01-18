/**
 * Collision detection system
 * All values in CENTS
 */
import { state } from '../state.js';
import { CONFIG, COLORS, formatMoney } from '../config.js';
import { TIMER_TICKS } from '../tickConfig.js';
import { getCurrentTick } from '../simulation.js';
import { Audio } from '../audio.js';
import { createParticles } from './particles.js';
import { addShake, addShockwave, flashEntity, showBalanceDelta } from './effects.js';
import { FloatingText } from '../entities/FloatingText.js';
import { logTransaction } from '../ui.js';
import { spawnSpill } from '../spawners.js';

export function checkCollisions() {
    const currentTick = getCurrentTick();
    // 1. Bullets vs Obstacles
    for (let b of state.bullets) {
        if (b.dead) continue;
        for (let o of state.obstacles) {
            const dist = Math.hypot(b.x - o.x, b.y - o.y);
            if (dist < o.radius * 0.9 + b.radius) {
                b.dead = true;
                Audio.impactAt(b.x, b.y);
                break;
            }
        }
    }

    // 2. Entities vs Obstacles (with dash bounce)
    for (let e of state.entities) {
        if (e.dead) continue;
        for (let o of state.obstacles) {
            const dx = e.x - o.x;
            const dy = e.y - o.y;
            const dist = Math.hypot(dx, dy);
            const minDist = e.radius + o.radius * 0.9;

            if (dist < minDist) {
                const angle = Math.atan2(dy, dx);
                const overlap = minDist - dist;

                e.x += Math.cos(angle) * overlap;
                e.y += Math.sin(angle) * overlap;
                
                const nx = Math.cos(angle);
                const ny = Math.sin(angle);
                const dot = e.vx * nx + e.vy * ny;
                
                if (dot < 0) {
                    const speed = Math.hypot(e.vx, e.vy);
                    if (e.dashActiveTimer > 0) {
                        // Elastic bounce (dash only)
                        const retention = CONFIG.dashBounceRetention ?? 0.6;
                        e.vx = (e.vx - 2 * dot * nx) * retention;
                        e.vy = (e.vy - 2 * dot * ny) * retention;
                    } else {
                        // Non-dash: slide along obstacle instead of bouncing (reduces jitter/stickiness)
                        e.vx = e.vx - dot * nx;
                        e.vy = e.vy - dot * ny;
                        // Slight damping to avoid micro-oscillation when rubbing walls
                        e.vx *= 0.98;
                        e.vy *= 0.98;
                    }
                    
                    // Clean impact: audio + flash only (no particles/shake for obstacle bounces)
                    if (speed > 5) {
                        Audio.impactAt(e.x, e.y, e.type === 'player');
                        
                        // Flash + shockwave only for dash impacts (intentionally dramatic)
                        if (e.dashActiveTimer > 0) {
                            flashEntity(e, COLORS.warning, 100);
                            addShockwave(e.x, e.y, 30, COLORS.warning);
                        }
                    }
                }
            }
        }
    }

    // 3. Bullets vs Entities
    for (let b of state.bullets) {
        if (b.dead) continue;
        for (let e of state.entities) {
            if (e.dead || e.type === 'food' || e.type === 'spill') continue;
            if (e.id === b.ownerId) continue;

            if (Math.hypot(b.x - e.x, b.y - e.y) < e.radius + b.radius) {
                b.dead = true;

                // Block during dash charge or invuln
                if ((e.isChargingDash || e.invulnTimer > 0) && (e.type === 'player' || e.type === 'bot')) {
                    state.floatTexts.push(new FloatingText(e.x, e.y - e.radius, "BLOCKED!", COLORS.white, 28));
                    
                    // Satisfying block effects
                    createParticles(b.x, b.y, 8, COLORS.white, 5);
                    addShockwave(b.x, b.y, 40, COLORS.white);
                    
                    // Flash blocker with shield glow
                    flashEntity(e, COLORS.white, 150);
                    e.scaleX = 1.15;
                    e.scaleY = 1.15;
                    
                    // Reflect bullet slightly (visual only)
                    addShake(5, b.x, b.y, e.type === 'player');
                    
                    Audio.blockAt(e.x, e.y, e.type === 'player');
                    continue;
                }

                // Impact multiplier for head-on collisions
                const dot = (b.vx * e.vx + b.vy * e.vy);
                let impactMult = 1.0;
                if (dot < 0) {
                    const entityVel = Math.hypot(e.vx, e.vy);
                    impactMult += (entityVel / 5.0);
                }

                // Combat damage (HP): no spill on hit; balance only drops on death.
                const damageHp = Math.floor(b.value * impactMult);
                e.takeDamage(damageHp, b.ownerId, false, b.x, b.y);
                
                // Give attacker magnet boost (reward for landing hits)
                const attacker = state.entities.find(ent => ent.id === b.ownerId);
                if (attacker) {
                    attacker.magnetBoostTimer = TIMER_TICKS.magnetBoostDuration;
                    
                    // Show damage dealt floating text for attacker (especially player)
                    if (attacker.type === 'player') {
                        state.floatTexts.push(new FloatingText(
                            b.x, b.y - 10, 
                            `${damageHp}`, 
                            COLORS.warning,  // Gold color for damage dealt
                            22
                        ));
                    }
                }

                // Knockback
                const angle = Math.atan2(b.vy, b.vx);
                const kb = (b.value * 0.08) / Math.sqrt(e.radius);
                e.vx += Math.cos(angle) * kb;
                e.vy += Math.sin(angle) * kb;
                
                // Clean hit: flash only (diep.io style - no particles/shockwave)
            }
        }
    }

    // 4. Entity vs Entity
    for (let i = 0; i < state.entities.length; i++) {
        let a = state.entities[i];
        if (a.type !== 'player' && a.type !== 'bot') continue;

        for (let j = 0; j < state.entities.length; j++) {
            let b = state.entities[j];
            if (a === b) continue;

            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dist = Math.hypot(dx, dy);

            // Pickup logic (food/spill)
            // Boosted magnet range when attacker has recently dealt damage
            const hasMagnetBoost = a.magnetBoostTimer > 0;
            const effectiveRange = CONFIG.magnetRange + (hasMagnetBoost ? CONFIG.magnetBoostRange : 0);
            
            if ((b.type === 'food' || b.type === 'spill') && dist < a.radius + b.radius + effectiveRange) {
                // Check loot ownership
                const ticksSinceSpawn = currentTick - b.spawnTick;
                if (b.type === 'spill' && b.ownerId && b.ownerId !== a.id && 
                    ticksSinceSpawn < TIMER_TICKS.lootOwnership) {
                    continue;
                }

                // Magnet effect (stability-focused):
                // - Only ONE collector should influence a pickup per tick (choose closest)
                // - Move along normalized direction with a strict per-tick cap (prevents teleport jitter)
                if (b.__magnetTick !== currentTick) {
                    b.__magnetTick = currentTick;
                    b.__magnetBestDist = Infinity;
                    b.__magnetBestId = null;
                    b.__magnetBestDx = 0;
                    b.__magnetBestDy = 0;
                    b.__magnetBestRange = effectiveRange;
                    b.__magnetBestBoost = hasMagnetBoost;
                }
                if (dist < b.__magnetBestDist) {
                    b.__magnetBestDist = dist;
                    b.__magnetBestId = a.id;
                    b.__magnetBestDx = dx;
                    b.__magnetBestDy = dy;
                    b.__magnetBestRange = effectiveRange;
                    b.__magnetBestBoost = hasMagnetBoost;
                }

                // Collect on touch (but prevent same-tick/instant invisible spill pickups)
                const canCollectSpill = b.type !== 'spill' || ticksSinceSpawn >= (CONFIG.spillPickupDelayTicks ?? 0);
                if (dist < a.radius + b.radius && canCollectSpill) {
                    a.balance += b.balance;
                    b.dead = true;
                    
                    if (a.type === 'player') {
                        if (b.type === 'spill' || b.balance > CONFIG.pelletValue) {
                            logTransaction(b.balance, 'gain');
                            showBalanceDelta(b.balance, true);
                        }
                        state.floatTexts.push(new FloatingText(
                            a.x, a.y - a.radius,
                            "+" + formatMoney(b.balance),
                            COLORS.primary, 40
                        ));
                        Audio.collect();
                        a.scaleX = 1.1;
                        a.scaleY = 1.1;
                    }
                }
            }

            // Player/Bot collision with dash bounce
            if ((b.type === 'player' || b.type === 'bot') && dist < a.radius + b.radius) {
                const angle = Math.atan2(dy, dx);
                const overlap = (a.radius + b.radius) - dist;

                // Separate bodies
                a.x += Math.cos(angle) * overlap * 0.5;
                a.y += Math.sin(angle) * overlap * 0.5;
                b.x -= Math.cos(angle) * overlap * 0.5;
                b.y -= Math.sin(angle) * overlap * 0.5;

                // SAVE original speeds BEFORE any modification
                const aOriginalSpeed = Math.hypot(a.vx, a.vy);
                const bOriginalSpeed = Math.hypot(b.vx, b.vy);
                const aMom = a.balance * aOriginalSpeed;
                const bMom = b.balance * bOriginalSpeed;

                // Collision normal (from a to b)
                const nx = Math.cos(angle);
                const ny = Math.sin(angle);

                // Check if either is dashing
                const aDashing = a.dashActiveTimer > 0;
                const bDashing = b.dashActiveTimer > 0;

                // Determine stun outcome
                let impact = false;
                let stunTarget = null;
                let attacker = null;

                if (aDashing && !bDashing && b.stunTimer <= 0) {
                    stunTarget = b;
                    attacker = a;
                    impact = true;
                } else if (bDashing && !aDashing && a.stunTimer <= 0) {
                    stunTarget = a;
                    attacker = b;
                    impact = true;
                } else if (aDashing && bDashing) {
                    if (aMom > bMom && b.stunTimer <= 0) {
                        stunTarget = b;
                        attacker = a;
                        impact = true;
                    } else if (bMom > aMom && a.stunTimer <= 0) {
                        stunTarget = a;
                        attacker = b;
                        impact = true;
                    }
                }

                if (impact && stunTarget && attacker) {
                    // === DASH IMPACT: Strong bounces for both ===
                    stunTarget.stunTimer = TIMER_TICKS.stunDuration;
                    attacker.fireCooldown = 0;
                    attacker.dashActiveTimer = 0;
                    
                    const originalAttackerSpeed = (attacker === a) ? aOriginalSpeed : bOriginalSpeed;
                    const impactAngle = Math.atan2(stunTarget.y - attacker.y, stunTarget.x - attacker.x);
                    
                    // TARGET: Flies away from attacker
                    const targetKnockback = 12 + originalAttackerSpeed * 1.5;
                    stunTarget.vx = Math.cos(impactAngle) * targetKnockback;
                    stunTarget.vy = Math.sin(impactAngle) * targetKnockback;
                    
                    // ATTACKER: Bounces BACK (opposite direction)
                    const attackerBounce = 8 + originalAttackerSpeed * 0.6;
                    attacker.vx = -Math.cos(impactAngle) * attackerBounce;
                    attacker.vy = -Math.sin(impactAngle) * attackerBounce;
                    
                    // Squash effects
                    stunTarget.scaleX = 1.4;
                    stunTarget.scaleY = 0.6;
                    attacker.scaleX = 0.7;
                    attacker.scaleY = 1.3;
                    
                    // Effects
                    createParticles(stunTarget.x, stunTarget.y, 10, COLORS.warning, 6);
                    addShockwave(stunTarget.x, stunTarget.y, 80, COLORS.warning);
                    flashEntity(stunTarget, COLORS.warning, 200);
                    
                    state.floatTexts.push(new FloatingText(
                        stunTarget.x, stunTarget.y - stunTarget.radius * 2, 
                        "STUNNED!", COLORS.warning, 30
                    ));
                    
                    const isPlayerInvolved = attacker.type === 'player' || stunTarget.type === 'player';
                    addShake(18, stunTarget.x, stunTarget.y, isPlayerInvolved);
                    Audio.stunAt(stunTarget.x, stunTarget.y, isPlayerInvolved);
                    if (attacker.type === 'player') {
                        Audio.comboAt(stunTarget.x, stunTarget.y, true);
                    }
                } else {
                    // === NON-DASH COLLISION: Standard elastic bounce ===
                    const v1n = a.vx * nx + a.vy * ny;
                    const v2n = b.vx * nx + b.vy * ny;
                    
                    // Reflect velocities along collision normal
                    const bounceStrength = 0.8;
                    a.vx += (v2n - v1n) * bounceStrength * nx;
                    a.vy += (v2n - v1n) * bounceStrength * ny;
                    b.vx += (v1n - v2n) * bounceStrength * nx;
                    b.vy += (v1n - v2n) * bounceStrength * ny;
                    
                    // Clean collision: audio only (no particles/shake for normal bumps)
                    if (aOriginalSpeed + bOriginalSpeed > 5) {
                        const midX = (a.x + b.x) / 2;
                        const midY = (a.y + b.y) / 2;
                        const isPlayerInvolved = a.type === 'player' || b.type === 'player';
                        Audio.impactAt(midX, midY, isPlayerInvolved);
                    }
                }
            }
        }
    }

    // Apply magnet movement once per pickup per tick (after choosing closest collector)
    // This avoids multi-attractor oscillation and reduces per-tick teleporting.
    for (const p of state.entities) {
        if (p.dead) continue;
        if (p.type !== 'food' && p.type !== 'spill') continue;
        if (p.__magnetTick !== currentTick) continue;
        if (!Number.isFinite(p.__magnetBestDist) || p.__magnetBestDist === Infinity) continue;
        const dist = p.__magnetBestDist;
        if (dist <= 0.0001) continue;

        const nx = p.__magnetBestDx / dist;
        const ny = p.__magnetBestDy / dist;

        const maxDist = (p.radius || 0) + 1 + (p.__magnetBestRange || 0); // soft scale; collector radius already baked into "in range" check
        const t = Math.max(0, Math.min(1, 1 - (dist / Math.max(1, maxDist))));
        const magnetMult = p.__magnetBestBoost ? (CONFIG.magnetBoostMult ?? 1.0) : 1.0;

        // Per-tick max movement cap (world units). This is the key anti-jitter.
        const maxMove = 6 * magnetMult;
        const moveAmt = Math.min(maxMove, (CONFIG.magnetStrength ?? 0.5) * magnetMult * (2 + 6 * t));

        const moveX = nx * moveAmt;
        const moveY = ny * moveAmt;

        p.x += moveX;
        p.y += moveY;
    }
}
