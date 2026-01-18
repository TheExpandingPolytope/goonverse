/**
 * Main Entity class for players, bots, food, and spills
 * 
 * Uses tick-based timers for deterministic simulation
 * Balance stored in CENTS (integer math)
 */
import { CONFIG, COLORS, ENTITY_HUES, formatMoney } from '../config.js';
import { TIMER_TICKS, TICK_FREQUENCY, TICK_MS } from '../tickConfig.js';

// Delta time in seconds for one tick
const DT = TICK_MS / 1000;
import { state, input, width, height } from '../state.js';
import { Audio } from '../audio.js';
import { Bullet } from './Bullet.js';
import { FloatingText } from './FloatingText.js';
import { createParticles } from '../systems/particles.js';
import { addShake, addShockwave, flashDamage, flashEntity, showBalanceDelta } from '../systems/effects.js';
import { logEvent, logTransaction, triggerGameOver } from '../ui.js';
import { spawnSpill, spawnBot } from '../spawners.js';
import { getCurrentTick, shouldRunSystem } from '../simulation.js';

export class Entity {
    constructor(x, y, balance, type, ownerId = null) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.balance = balance; // In CENTS
        this.type = type;
        this.id = Math.random();
        this.ownerId = ownerId;

        // Combat HP (NOT MONEY): players/bots have a static HP pool with regen.
        // Balance is ONLY dropped on death (100% ejected; no per-hit spill/burn).
        this.maxHp = (type === 'player' || type === 'bot') ? (CONFIG.maxHealth ?? 100) : 0;
        this.hp = this.maxHp;
        this.lastDamagedTick = -999999;
        this.hpRegenCarryMs = 0; // fixed-point carry: (hp * ms) / sec
        this.exitCombatTag = 0;  // ticks remaining; blocks cashout progress after taking damage

        this.spawnTick = getCurrentTick();
        this.radius = this.getRadius();
        this.dead = false;

        this.name = type === 'player' ? 'YOU' : 'BOT-' + Math.floor(Math.random() * 99);
        // Theme colors (no PFP avatars)
        const hue = ENTITY_HUES[Math.floor(Math.random() * ENTITY_HUES.length)];
        this.avatarColor = `hsl(${hue}, 65%, 58%)`; // base fill color
        this.outlineColor = `hsl(${hue}, 50%, 22%)`; // soft dark outline
        this.img = null; // deprecated

        this.aimAngle = 0;
        this.scaleX = 1;
        this.scaleY = 1;
        this.rotation = 0;

        // Interpolation: previous tick position
        this.prevX = x;
        this.prevY = y;
        // Render position (interpolated)
        this.renderX = x;
        this.renderY = y;

        // Tick-based timers (count DOWN in ticks)
        this.dashCooldown = 0;
        this.dashActiveTimer = 0;
        this.stunTimer = 0;
        this.fireCooldown = 0;
        this.invulnTimer = 0;
        this.slowTimer = 0;
        this.hitFlashTimer = 0;
        this.shootRecoveryTimer = 0; // Reduced mobility after shooting
        this.magnetBoostTimer = 0;   // Boosted magnetism after dealing damage

        // Dash charging (tracked in ticks)
        this.isChargingDash = false;
        this.dashChargeStartTick = 0;

        // Spawn animation (in ticks)
        this.spawnAnimTimer = TIMER_TICKS.spawnAnimDuration;

        // Exit mechanic (player only)
        this.isExiting = false;
        this.exitProgress = 0; // Counts UP to exitDuration
        this.exitComplete = false; // Set true when exit succeeds

        // Shooting charge (replicated state; renderer uses this so everyone can see charging)
        this.isChargingShot = false;
        this.shootChargeRatio = 0;         // 0..1
        this.shootChargeVisualTicks = 0;   // brief ring even for instant bot shots

        // Spill unlock animation
        this.unlockTick = (type === 'spill' && ownerId) 
            ? getCurrentTick() + TIMER_TICKS.lootOwnership 
            : 0;
        this.unlockPopTimer = 0; // Countdown for pop animation

        // Bot AI state
        this.stuckCounter = 0;      // Ticks spent barely moving
        this.lastX = x;             // Position last tick (for stuck detection)
        this.lastY = y;
        this.blacklistedTargets = new Set(); // Targets we gave up on
        // Resource-target progress tracking (prevents fixation on unreachable pellets/spills)
        this.targetProgressId = null;
        this.targetBestDist = Infinity;
        this.targetNoProgressTicks = 0;

        // Combat readability (player only, harmless for bots)
        this.lastHitSourceId = null;
        this.lastHitAmount = 0;
        this.lastHitTick = 0;
        this.lastHitAngle = null; // Direction TO attacker (radians)
        this.hitIndicatorTimer = 0; // ticks
        this.lastDeathCause = null; // 'bullet' | 'burn' | 'unknown'

        // Visual effects
        this.flashColor = null;
        this.flashTimer = 0;
        
        // Balance delta display (for in-world text)
        this.prevBalance = balance;
        this.balanceDelta = 0;
        this.balanceDeltaTimer = 0; // ms remaining to show delta
        this.balanceFlashTimer = 0; // ms remaining for flash effect

        // Bot AI
        this.target = null;
        this.actionTimer = 0;

        // UI timeout reference
        this.statusTimeout = null;
    }

    getRadius() {
        // Spawn animation easing
        const animProgress = this.spawnAnimTimer > 0 
            ? 1 - (this.spawnAnimTimer / TIMER_TICKS.spawnAnimDuration)
            : 1;
        const scale = animProgress < 1 ? this.easeOutBack(animProgress) : 1;
        
        // Food/Spill: smaller, value-based sizing
        if (this.type === 'food' || this.type === 'spill') {
            const minR = CONFIG.pelletRadiusMin ?? 6;
            const maxR = CONFIG.pelletRadiusMax ?? 14;
            // Scale based on value relative to pellet value
            const valueRatio = Math.min(1, this.balance / Math.max(1, CONFIG.pelletValue * 3));
            const base = minR + (maxR - minR) * valueRatio;
            return base * scale;
        }
        
        // Players/Bots: size scales with stake-units
        const stakeUnits = Math.max(0.05, this.balance / Math.max(1, CONFIG.entryFee));
        let base = Math.pow(stakeUnits, CONFIG.radiusExponent) * CONFIG.radiusAtStake;

        // Clamp extremes (prevents tiny "mosquitos" and huge whales)
        base = Math.max(CONFIG.radiusMin, Math.min(CONFIG.radiusMax, base));

        return base * scale;
    }

    /**
     * Mobility multiplier based on size, bounded for fairness.
     * Smaller players get a modest boost; larger players get a modest penalty.
     */
    getMobilityMult() {
        const r = Math.max(1, this.radius || 1);
        // Baseline preserves the old feel at radiusRef:
        // oldFactor = 12 / sqrt(radius)
        // baselineFactor = 12 / sqrt(radiusRef)
        const baselineFactor = 12 / Math.sqrt(CONFIG.mobilityRadiusRef);
        const ratio = Math.pow(CONFIG.mobilityRadiusRef / r, CONFIG.mobilityExponent);
        const clamped = Math.max(CONFIG.mobilityMin, Math.min(CONFIG.mobilityMax, ratio));
        return baselineFactor * clamped;
    }

    easeOutBack(x) {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }

    /**
     * Tick-based update - runs at fixed rate
     * Handles physics, timers, AI (deterministic)
     */
    tick() {
        if (this.dead) return;

        // Store previous position for interpolation
        this.prevX = this.x;
        this.prevY = this.y;

        // No trail history - using velocity-based motion blur instead

        // Decrement tick-based timers
        if (this.spawnAnimTimer > 0) this.spawnAnimTimer--;
        if (this.hitFlashTimer > 0) this.hitFlashTimer--;
        if (this.invulnTimer > 0) this.invulnTimer--;
        if (this.dashCooldown > 0) this.dashCooldown--;
        if (this.dashActiveTimer > 0) this.dashActiveTimer--;
        if (this.fireCooldown > 0) this.fireCooldown--;
        if (this.slowTimer > 0) this.slowTimer--;
        if (this.shootRecoveryTimer > 0) this.shootRecoveryTimer--;
        if (this.magnetBoostTimer > 0) this.magnetBoostTimer--;
        if (this.hitIndicatorTimer > 0) this.hitIndicatorTimer--;
        if (this.unlockPopTimer > 0) this.unlockPopTimer--;
        if (this.exitCombatTag > 0) this.exitCombatTag--;
        
        // Spill unlock pop - trigger when lock expires
        if (this.type === 'spill' && this.unlockTick > 0 && getCurrentTick() === this.unlockTick) {
            this.unlockPopTimer = 8; // 8 ticks of pop animation
            this.unlockTick = 0; // Don't trigger again
        }

        // Stun timer
        if (this.stunTimer > 0) {
            this.stunTimer--;
            this.isChargingDash = false;
            
            if (this.type === 'player') {
                const status = document.getElementById('status-msg');
                status.style.display = 'block';
                status.innerText = "STUNNED";
                status.className = "status-overheat";
            }
        } else {
            if (this.type === 'player') {
                if (document.getElementById('status-msg').innerText === "STUNNED") {
                    document.getElementById('status-msg').style.display = 'none';
                }
            }
        }

        // HP Regen (players/bots only): starts after a delay since last damage.
        if ((this.type === 'player' || this.type === 'bot') && this.maxHp > 0) {
            const regenPerSec = CONFIG.healthRegenPerSec ?? 0;
            if (regenPerSec > 0 && this.hp > 0 && this.hp < this.maxHp) {
                const ticksSinceDamage = getCurrentTick() - (this.lastDamagedTick ?? -999999);
                if (ticksSinceDamage >= (CONFIG.healthRegenDelayTicks ?? 0)) {
                    this.hpRegenCarryMs += regenPerSec * TICK_MS;
                    const addHp = Math.floor(this.hpRegenCarryMs / 1000);
                    if (addHp > 0) {
                        this.hp = Math.min(this.maxHp, this.hp + addHp);
                        this.hpRegenCarryMs -= addHp * 1000;
                    }
                } else {
                    // Reset carry while regen is gated (prevents a big "catch-up" heal)
                    this.hpRegenCarryMs = 0;
                }
            } else if (this.hp >= this.maxHp) {
                this.hpRegenCarryMs = 0;
            }
        }

        // Cooldown bar UI (player only)
        if (this.type === 'player') {
            const bar = document.getElementById('cooldown-bar');
            const container = document.getElementById('cooldown-bar-container');
            if (this.dashCooldown > 0) {
                container.style.display = 'block';
                const pct = Math.min(100, (this.dashCooldown / TIMER_TICKS.dashCooldown) * 100);
                bar.style.width = pct + '%';
                bar.style.background = '#f43f5e';
            } else {
                container.style.display = 'none';
            }
        }

        // Physics (delta-time based)
        this.x += this.vx * DT * 60; // Velocity is in units per 1/60th sec for feel
        this.y += this.vy * DT * 60;
        
        // Friction: exponential decay based on time
        const frictionFactor = Math.pow(CONFIG.frictionPerSec, DT);
        this.vx *= frictionFactor;
        this.vy *= frictionFactor;

        // Speed cap (not during dash)
        const speed = Math.hypot(this.vx, this.vy);
        const maxSpeed = CONFIG.maxSpeedBase * this.getMobilityMult();
        if (speed > maxSpeed && this.dashActiveTimer <= 0) {
            const dragFactor = Math.pow(0.1, DT); // Strong drag when over speed
            this.vx *= dragFactor;
            this.vy *= dragFactor;
        }

        this.radius = this.getRadius();

        // Type-specific tick logic
        if (this.type === 'bot') this.tickBot();
        if (this.type === 'player') this.tickPlayer();

        // Decay shooting charge visuals
        if (this.shootChargeVisualTicks > 0) this.shootChargeVisualTicks--;
        if (!this.isChargingShot && this.shootChargeVisualTicks <= 0) {
            this.shootChargeRatio = 0;
        }
    }

    /**
     * Player-specific tick logic
     */
    tickPlayer() {
        if (this.stunTimer > 0) {
            // Cancel exit if stunned
            if (this.isExiting && this.type === 'player') {
                logEvent('CASHOUT CANCELLED', 'danger');
            }
            this.isExiting = false;
            this.exitProgress = 0;
            return;
        }

        // Handle EXIT (Q key) - takes priority, disables other actions
        if (input.keys.q) {
            // Can't cash out while combat-tagged (prevents "take 1 pellet / get tapped / exit" meta)
            if ((this.exitCombatTag || 0) > 0) {
                // Light feedback (rate-limited)
                if (this.type === 'player') {
                    if (!this.lastCombatExitWarnTick || (getCurrentTick() - this.lastCombatExitWarnTick) > 20) {
                        this.lastCombatExitWarnTick = getCurrentTick();
                        state.floatTexts.push(new FloatingText(this.x, this.y - this.radius, "IN COMBAT", COLORS.danger, 22));
                    }
                }
            } else {
                const startingExit = !this.isExiting;
                this.isExiting = true;
                this.exitProgress++;

                if (startingExit && this.type === 'player') {
                    logEvent(`CASHING OUT ${formatMoney(this.balance)}`, 'exit');
                }
                
                // Cancel any dash charging
                this.isChargingDash = false;
                
                // Check if exit complete
                if (this.exitProgress >= CONFIG.exitDurationTicks) {
                    this.exitComplete = true;
                    // Exit will be handled by game loop
                }
                
                return; // Can't do anything else while exiting
            }
        } else {
            // Released Q, cancel exit
            if (this.isExiting) {
                this.isExiting = false;
                this.exitProgress = 0;
            }
        }

        // Update shot charging state (so others can see it too)
        if (input.lmb && this.fireCooldown <= 0 && !this.isExiting && this.stunTimer <= 0) {
            this.isChargingShot = true;
            const elapsed = Math.min(Date.now() - input.lmbStart, CONFIG.shootChargeTimeMs);
            this.shootChargeRatio = Math.max(0, Math.min(1, elapsed / CONFIG.shootChargeTimeMs));
            this.shootChargeVisualTicks = 2; // keep alive across ticks while held
        } else {
            this.isChargingShot = false;
        }

        // Handle dash input (only if not exiting)
        const holding = input.rmb || input.keys.space;
        
        if (holding) {
            if (!this.isChargingDash && this.dashCooldown <= 0) {
                this.isChargingDash = true;
                this.dashChargeStartTick = getCurrentTick();
            }

            // Check overheat
            if (this.isChargingDash) {
                const chargeTicks = getCurrentTick() - this.dashChargeStartTick;
                if (chargeTicks >= TIMER_TICKS.dashOverheat) {
                    this.stunTimer = TIMER_TICKS.stunDuration;
                    this.isChargingDash = false;
                    addShake(10, this.x, this.y, this.type === 'player');
                    createParticles(this.x, this.y, 6, COLORS.danger, 5);
                    state.floatTexts.push(new FloatingText(this.x, this.y - this.radius, "OVERHEAT", "#ff0000", 30));
                }
            }
        } else {
            // Release dash
            if (this.isChargingDash) {
                const chargeTicks = getCurrentTick() - this.dashChargeStartTick;
                this.triggerDash(chargeTicks);
                this.isChargingDash = false;
            }
        }

        // Update aim angle from mouse (client-side)
        const w = width || window.innerWidth;
        const h = height || window.innerHeight;
        const screenX = (this.x - state.camera.x) * state.camera.zoom + w / 2;
        const screenY = (this.y - state.camera.y) * state.camera.zoom + h / 2;
        const dx = input.mouse.x - screenX;
        const dy = input.mouse.y - screenY;
        this.aimAngle = Math.atan2(dy, dx);
    }

    /**
     * Execute dash ability
     * @param {number} chargeTicks - How long dash was charged in ticks
     */
    triggerDash(chargeTicks) {
        // Calculate charge ratio first (needed for cost calculation)
        const ratio = Math.min(1, chargeTicks / TIMER_TICKS.dashChargeMax);
        
        // Cost scales with charge: min cost for tap dashes, max cost for full charge
        const cost = Math.floor(
            CONFIG.dashMinCost + (CONFIG.dashMaxCost - CONFIG.dashMinCost) * ratio
        );

        // Cost check (in cents)
        if (this.balance - cost <= CONFIG.minBalance) {
            Audio.insolvent();
            if (this.type === 'player') {
                state.floatTexts.push(new FloatingText(this.x, this.y - this.radius, "NO FUNDS", "#fbbf24", 20));
            }
            return;
        }

        // Apply cost
        this.balance -= cost;
        // Conservation: dash cost is transferred to world reserve (not deleted)
        state.worldReserve += cost;
        // Dash cost is active revenue (ignored by passive emissions)

        // Calculate force based on charge (ratio already computed above)
        const force = CONFIG.dashBaseForce + (CONFIG.dashMaxForce - CONFIG.dashBaseForce) * ratio;

        // Determine direction
        let angle = this.aimAngle;
        let ax = 0, ay = 0;
        if (input.keys.w) ay -= 1;
        if (input.keys.s) ay += 1;
        if (input.keys.a) ax -= 1;
        if (input.keys.d) ax += 1;

        if (ax !== 0 || ay !== 0) {
            angle = Math.atan2(ay, ax);
        }

        // Apply velocity
        this.vx += Math.cos(angle) * force;
        this.vy += Math.sin(angle) * force;

        // Set timers
        this.invulnTimer = TIMER_TICKS.invulnDuration;
        this.dashActiveTimer = TIMER_TICKS.dashActiveDuration;
        this.dashCooldown = TIMER_TICKS.dashCooldown;

        // Effects
        this.scaleX = 1.6;
        this.scaleY = 0.5;
        addShake(5 + (10 * ratio), this.x, this.y, this.type === 'player');
        createParticles(this.x, this.y, 6, COLORS.white, 6);
        addShockwave(this.x, this.y, 50);
        Audio.dash();

        if (this.type === 'player') {
            state.floatTexts.push(new FloatingText(
                this.x, this.y - this.radius,
                "-" + formatMoney(cost),
                "#f43f5e", 20
            ));
        }
    }

    /**
     * Bot AI tick - Smart behavior with dodging, positioning, and tactical decisions
     */
    tickBot() {
        if (this.stunTimer > 0) return;

        this.actionTimer++;
        const nowTick = getCurrentTick();
        
        // === STUCK DETECTION ===
        const movedDist = Math.hypot(this.x - this.lastX, this.y - this.lastY);
        this.lastX = this.x;
        this.lastY = this.y;
        
        if (movedDist < 0.5) {
            this.stuckCounter++;
        } else {
            this.stuckCounter = Math.max(0, this.stuckCounter - 2); // Decay when moving
        }
        
        // If stuck for too long, blacklist current target and force retarget
        if (this.stuckCounter > 40 && this.target) { // ~2 seconds stuck
            if (this.target.type === 'food' || this.target.type === 'spill') {
                this.blacklistedTargets.add(this.target.id);
                // Clear old blacklist entries after some time
                if (this.blacklistedTargets.size > 10) {
                    const arr = Array.from(this.blacklistedTargets);
                    this.blacklistedTargets.delete(arr[0]);
                }
            }
            this.target = null;
            this.stuckCounter = 0;
        }

        // === 1. THREAT DETECTION ===
        const threats = this.detectThreats();
        const incomingBullets = threats.bullets;
        const nearbyEnemies = threats.enemies;
        const isUnderAttack = incomingBullets.length > 0 || this.hitFlashTimer > 0;
        
        // === 2. TACTICAL STATE ASSESSMENT ===
        const healthRatio = (this.maxHp > 0) ? (this.hp / this.maxHp) : 1; // 0..1
        const isLowHealth = healthRatio < 0.4;
        const isWealthy = this.balance > (CONFIG.entryFee * 2.0);     // >200% stake
        const hasDash = this.dashCooldown <= 0 && this.balance > (CONFIG.dashMinCost + (CONFIG.entryFee * 0.1));
        const ticksAlive = nowTick - this.spawnTick;
        const risk = typeof this.riskAppetite === 'number' ? this.riskAppetite : 0.5;
        const exitThreatDist = 320 + (1 - risk) * 520; // cautious bots require more space to start/continue exit
        let seekingExitSafety = false;

        // --- EXIT LOGIC ---
        // Check if we should switch to exiting state
        if (!this.wantsToExit) {
            // Profit target met?
            const profitMet = this.targetProfit && this.balance >= this.targetProfit;
            // Time target met (and profitable)?
            const timeMet = this.targetSessionTicks && ticksAlive > this.targetSessionTicks && this.balance > CONFIG.entryFee;
            
            if (profitMet || timeMet) {
                // Commit to wanting to exit; execution happens once we find safety.
                this.wantsToExit = true;
            }
        }

        // If we want to exit, try to execute it
        if (this.wantsToExit) {
            const nearestEnemyDist = nearbyEnemies.length
                ? Math.min(...nearbyEnemies.map(e => Math.hypot(e.x - this.x, e.y - this.y)))
                : Infinity;
            const combatTagged = (this.exitCombatTag || 0) > 0;
            const threatened =
                incomingBullets.length > 0 ||
                isUnderAttack ||
                combatTagged ||
                nearestEnemyDist < exitThreatDist;
            
            if (threatened) {
                this.isExiting = false;
                seekingExitSafety = true;
                this.exitPatience = (this.exitPatience || 0) + 1;
            } else {
                // Safe enough: "hold Q" and progress exit (bots don't have input)
                this.isExiting = true;
                this.exitProgress++;
                // Strongly damp movement while cashing out
                this.vx *= 0.6;
                this.vy *= 0.6;

                if (this.exitProgress >= CONFIG.exitDurationTicks) {
                    this.exitComplete = true;
                }
                return; // no actions while exiting
            }
        } else {
            this.isExiting = false;
        }
        // ------------------
        
        // If we're trying to exit but it's not safe, prioritize finding safety over targets/combat.
        if (seekingExitSafety) {
            this.target = null;
        }

        // === 3. TARGET SELECTION (less frequent) ===
        if (!seekingExitSafety && (shouldRunSystem('botTargeting') || !this.target || this.target.dead)) {
            this.selectTarget(isLowHealth, isWealthy);
        }

        // === TARGET PROGRESS CHECK (resource fixation fix) ===
        // If we keep chasing the same food/spill but our closest distance isn't improving,
        // assume it's effectively unreachable (border/obstacle local-minima) and give up.
        const isResourceTarget = this.target && (this.target.type === 'food' || this.target.type === 'spill');
        if (isResourceTarget) {
            const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
            if (this.targetProgressId !== this.target.id) {
                this.targetProgressId = this.target.id;
                this.targetBestDist = d;
                this.targetNoProgressTicks = 0;
            } else {
                // Require meaningful progress to reset (prevents jitter false-resets)
                if (d < this.targetBestDist - 6) {
                    this.targetBestDist = d;
                    this.targetNoProgressTicks = 0;
                } else {
                    this.targetNoProgressTicks++;
                }
            }

            // Allow more time if target line is obstructed (path around obstacle)
            const obstructed = this.isObstructed(this.target);
            const stallLimit = obstructed ? 120 : 80; // ~6s vs ~4s at 20 tps
            if (this.targetNoProgressTicks > stallLimit) {
                this.blacklistedTargets.add(this.target.id);
                if (this.blacklistedTargets.size > 12) {
                    const arr = Array.from(this.blacklistedTargets);
                    this.blacklistedTargets.delete(arr[0]);
                }
                this.target = null;
                this.targetProgressId = null;
                this.targetBestDist = Infinity;
                this.targetNoProgressTicks = 0;
            }
        } else {
            this.targetProgressId = null;
            this.targetBestDist = Infinity;
            this.targetNoProgressTicks = 0;
        }

        // === 4. MOVEMENT DECISION ===
        let moveX = 0, moveY = 0;
        let speedMult = this.slowTimer > 0 ? 0.5 : 1.0;
        if (this.shootRecoveryTimer > 0) speedMult *= CONFIG.shootRecoveryMoveMult;

        // Exit safety-seeking movement: move away from threats + toward center.
        if (seekingExitSafety) {
            let sx = 0, sy = 0;
            for (const e of nearbyEnemies) {
                const dx = this.x - e.x;
                const dy = this.y - e.y;
                const d = Math.max(1, Math.hypot(dx, dy));
                const w = 90000 / (d * d); // strong inverse-square repulsion
                sx += (dx / d) * w;
                sy += (dy / d) * w;
            }
            for (const b of incomingBullets) {
                const dx = this.x - b.x;
                const dy = this.y - b.y;
                const d = Math.max(1, Math.hypot(dx, dy));
                const w = 120000 / (d * d);
                sx += (dx / d) * w;
                sy += (dy / d) * w;
            }
            // Bias toward center (generally safer + more contestable exits)
            const dc = Math.max(1, Math.hypot(this.x, this.y));
            sx += (-this.x / dc) * 1.8;
            sy += (-this.y / dc) * 1.8;

            const sl = Math.hypot(sx, sy);
            if (sl > 0.001) {
                moveX += sx / sl;
                moveY += sy / sl;
                this.aimAngle = Math.atan2(moveY, moveX);
            } else {
                // If no clear gradient, drift toward center
                moveX += (-this.x / dc);
                moveY += (-this.y / dc);
            }
            // While seeking safety, don't shoot (keep mobility)
            speedMult *= 1.05;
        }

        // 4a. DODGE incoming bullets (highest priority)
        if (incomingBullets.length > 0) {
            const dodge = this.calculateDodge(incomingBullets);
            moveX += dodge.x * 3.0; // Strong dodge impulse
            moveY += dodge.y * 3.0;
        }

        // 4b. RETREAT if low health and under attack
        if (isLowHealth && isUnderAttack && nearbyEnemies.length > 0) {
            const retreatAngle = this.getRetreatAngle(nearbyEnemies);
            moveX += Math.cos(retreatAngle) * 2.0;
            moveY += Math.sin(retreatAngle) * 2.0;
        }
        // 4c. PURSUE target with smart positioning
        else if (this.target) {
            const pursuit = this.calculatePursuit(this.target, nearbyEnemies);
            moveX += pursuit.x;
            moveY += pursuit.y;
            this.aimAngle = pursuit.aimAngle;
        } else {
            // Active wander - move toward center with some randomness
            const toCenterX = -this.x;
            const toCenterY = -this.y;
            const toCenterLen = Math.hypot(toCenterX, toCenterY);
            
            if (toCenterLen > 200) {
                // Move toward center if far from it
                moveX = (toCenterX / toCenterLen) * 1.0;
                moveY = (toCenterY / toCenterLen) * 1.0;
            } else {
                // Near center - wander randomly
                this.aimAngle += (Math.random() - 0.5) * 0.2;
                moveX = Math.cos(this.aimAngle) * 1.0;
                moveY = Math.sin(this.aimAngle) * 1.0;
            }
        }

        // 4d. Obstacle avoidance (stronger)
        state.obstacles.forEach(o => {
            const dist = Math.hypot(o.x - this.x, o.y - this.y);
            const avoidRange = o.radius + 150;
            if (dist < avoidRange) {
                const ang = Math.atan2(this.y - o.y, this.x - o.x);
                // Stronger force closer to obstacle
                const t = 1 - dist / avoidRange;
                const strength = 3.0 * t * t; // Quadratic falloff
                moveX += Math.cos(ang) * strength;
                moveY += Math.sin(ang) * strength;
            }
        });

        // 4e. World border avoidance (CIRCLE - scales with proximity)
        const br = state.borderRadius ?? CONFIG.worldRadiusMin;
        const borderDist = 280;
        const dCenter = Math.hypot(this.x, this.y);
        const edgeDist = br - dCenter;
        
        // If chasing a resource near the edge, soften border repulsion so bots can finish pickups.
        const pursuingResource = this.target && (this.target.type === 'food' || this.target.type === 'spill');
        const borderPushMult = pursuingResource ? 0.45 : 1.0;

        if (edgeDist < borderDist) {
            const t = 1 - (edgeDist / borderDist);
            const strength = 4.0 * t * t * borderPushMult;
            const nx = dCenter > 0.001 ? (this.x / dCenter) : 1;
            const ny = dCenter > 0.001 ? (this.y / dCenter) : 0;
            // Push inward (toward center)
            moveX -= nx * strength;
            moveY -= ny * strength;
        }

        // 4f. Stuck detection - if nearly stationary, add random wander
        const speed = Math.hypot(this.vx, this.vy);
        if (speed < 0.3 && Math.hypot(moveX, moveY) < 0.5) {
            // Bot is stuck - add random movement toward center
            const toCenterX = -this.x;
            const toCenterY = -this.y;
            const toCenterLen = Math.hypot(toCenterX, toCenterY);
            if (toCenterLen > 0) {
                moveX += (toCenterX / toCenterLen) * 1.5;
                moveY += (toCenterY / toCenterLen) * 1.5;
            }
            // Plus some randomness
            moveX += (Math.random() - 0.5) * 2;
            moveY += (Math.random() - 0.5) * 2;
        }

        // Apply movement
        const len = Math.hypot(moveX, moveY);
        if (len > 0.01) {
            moveX /= len;
            moveY /= len;
            
            // Damage slow logic for bots
            if (this.slowTimer > 0) speedMult *= (CONFIG.damageSlowMult ?? 0.6);
            
            const accelVal = CONFIG.accelPerSec * DT * this.getMobilityMult() * speedMult;
            this.vx += moveX * accelVal;
            this.vy += moveY * accelVal;
        }

        // === 5. COMBAT ACTIONS ===
        if (seekingExitSafety) return;
        if (shouldRunSystem('botShootDecision') && this.target) {
            const targetDist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
            const isHostileTarget = this.target.type === 'player' || this.target.type === 'bot';
            
            // 5a. DASH - offensive or defensive
            if (hasDash) {
                // Offensive dash: target is stunned, low health, or exiting
                const targetHealthLow = this.target && (this.target.maxHp > 0) ? (this.target.hp / this.target.maxHp) < 0.45 : false;
                const shouldDashAttack = isHostileTarget && targetDist < 250 && 
                    (this.target.stunTimer > 0 || this.target.isExiting || 
                     targetHealthLow);
                
                // Defensive dash: under heavy attack and low health
                const shouldDashEscape = isLowHealth && isUnderAttack && 
                    nearbyEnemies.some(e => Math.hypot(e.x - this.x, e.y - this.y) < 200);
                
                if (shouldDashAttack) {
                    this.triggerBotDash(this.aimAngle);
                } else if (shouldDashEscape) {
                    const escapeAngle = this.getRetreatAngle(nearbyEnemies);
                    this.triggerBotDash(escapeAngle);
                }
            }
            
            // 5b. SHOOT - smart shooting with lead prediction
            if (isHostileTarget && this.fireCooldown <= 0 && !isLowHealth) {
                const shootDecision = this.calculateShot(this.target, targetDist);
                if (shootDecision.shouldShoot) {
                    this.shoot(shootDecision.angle, shootDecision.chargeRatio);
                }
            }
        }
        
        // === 6. EXIT ATTEMPT (legacy, now handled in state assessment) ===
        // Kept empty to preserve structure for future modules
        /*
        if (isWealthy && !isUnderAttack && nearbyEnemies.length === 0) {
            // ...
        }
        */
    }

    /**
     * Detect threats: incoming bullets and nearby enemies
     */
    detectThreats() {
        const bullets = [];
        const enemies = [];
        
        // Find bullets heading toward us
        state.bullets.forEach(b => {
            if (b.ownerId === this.id) return; // Own bullet
            
            const dx = this.x - b.x;
            const dy = this.y - b.y;
            const dist = Math.hypot(dx, dy);
            
            if (dist > 400) return; // Too far
            
            // Check if bullet is heading toward us
            const bulletAngle = Math.atan2(b.vy, b.vx);
            const toUsAngle = Math.atan2(dy, dx);
            let angleDiff = Math.abs(bulletAngle - toUsAngle);
            if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
            
            // Bullet is heading roughly toward us (within 45 degrees)
            if (angleDiff < Math.PI / 4) {
                bullets.push({
                    x: b.x, y: b.y, 
                    vx: b.vx, vy: b.vy,
                    dist: dist,
                    angle: bulletAngle
                });
            }
        });
        
        // Find nearby enemies
        state.entities.forEach(e => {
            if (e === this || e.dead) return;
            if (e.type !== 'player' && e.type !== 'bot') return;
            
            const dist = Math.hypot(e.x - this.x, e.y - this.y);
            if (dist < 600) {
                enemies.push(e);
            }
        });
        
        return { bullets, enemies };
    }

    /**
     * Calculate dodge direction from incoming bullets
     */
    calculateDodge(bullets) {
        let dodgeX = 0, dodgeY = 0;
        
        bullets.forEach(b => {
            // Perpendicular to bullet direction
            const perpAngle = b.angle + Math.PI / 2;
            
            // Dodge in the direction we're already moving (if any)
            const myMoveAngle = Math.atan2(this.vy, this.vx);
            let dodgeAngle = perpAngle;
            
            // Choose the perpendicular direction closer to our current movement
            const altAngle = b.angle - Math.PI / 2;
            if (Math.abs(myMoveAngle - altAngle) < Math.abs(myMoveAngle - perpAngle)) {
                dodgeAngle = altAngle;
            }
            
            // Urgency based on distance
            const urgency = Math.max(0.5, 1 - b.dist / 300);
            dodgeX += Math.cos(dodgeAngle) * urgency;
            dodgeY += Math.sin(dodgeAngle) * urgency;
        });
        
        return { x: dodgeX, y: dodgeY };
    }

    /**
     * Calculate retreat angle away from enemies
     */
    getRetreatAngle(enemies) {
        let awayX = 0, awayY = 0;
        
        enemies.forEach(e => {
            const dx = this.x - e.x;
            const dy = this.y - e.y;
            const dist = Math.max(1, Math.hypot(dx, dy));
            // Weight by inverse distance (closer = run harder)
            awayX += (dx / dist) * (1 / dist) * 100;
            awayY += (dy / dist) * (1 / dist) * 100;
        });
        
        return Math.atan2(awayY, awayX);
    }

    /**
     * Calculate pursuit movement with circle-strafing and optimal distance
     */
    calculatePursuit(target, nearbyEnemies) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy);
        const angleToTarget = Math.atan2(dy, dx);
        
        let moveX = 0, moveY = 0;
        
        const isHostile = target.type === 'player' || target.type === 'bot';
        
        if (isHostile) {
            // Optimal combat distance: not too close (dash range), not too far (bullet range)
            const optimalDist = 200;
            const distError = dist - optimalDist;
            
            // Move toward/away to maintain optimal distance
            const approachStrength = Math.min(1, Math.abs(distError) / 100) * Math.sign(distError);
            moveX += Math.cos(angleToTarget) * approachStrength;
            moveY += Math.sin(angleToTarget) * approachStrength;
            
            // Circle strafe (perpendicular movement)
            const strafeAngle = angleToTarget + Math.PI / 2;
            const strafeDir = (this.id * 1000) % 2 === 0 ? 1 : -1; // Consistent strafe direction per bot
            moveX += Math.cos(strafeAngle) * 0.6 * strafeDir;
            moveY += Math.sin(strafeAngle) * 0.6 * strafeDir;
            
        } else {
            // Non-hostile target (food/spill): move directly toward
            moveX = Math.cos(angleToTarget);
            moveY = Math.sin(angleToTarget);
        }
        
        // Lead the aim for moving targets
        let aimAngle = angleToTarget;
        if (isHostile && (target.vx !== 0 || target.vy !== 0)) {
            // Predict where target will be
            const bulletSpeed = CONFIG.maxSpeedBase * CONFIG.bulletSpeedMult * 60;
            const timeToHit = dist / bulletSpeed;
            const predictX = target.x + target.vx * timeToHit * 60; // Convert per-tick to per-second
            const predictY = target.y + target.vy * timeToHit * 60;
            aimAngle = Math.atan2(predictY - this.y, predictX - this.x);
        }
        
        return { x: moveX, y: moveY, aimAngle };
    }

    /**
     * Calculate shot decision with lead prediction
     */
    calculateShot(target, dist) {
        // Don't shoot if too far or too close
        if (dist > 450 || dist < 50) {
            return { shouldShoot: false };
        }
        
        // Don't shoot if target is behind obstacle
        if (this.isObstructed(target)) {
            return { shouldShoot: false };
        }
        
        // Base chance to shoot (higher when target is stunned/exiting)
        let shootChance = 0.15;
        if (target.stunTimer > 0) shootChance = 0.6;
        if (target.isExiting) shootChance = 0.5;
        if (target.shootRecoveryTimer > 0) shootChance += 0.1; // Target is vulnerable
        
        if (Math.random() > shootChance) {
            return { shouldShoot: false };
        }
        
        // Calculate lead angle
        const bulletSpeed = CONFIG.maxSpeedBase * CONFIG.bulletSpeedMult * 60;
        const timeToHit = dist / bulletSpeed;
        const predictX = target.x + target.vx * timeToHit * 60;
        const predictY = target.y + target.vy * timeToHit * 60;
        let angle = Math.atan2(predictY - this.y, predictX - this.x);
        
        // Add slight randomness to prevent perfect aim
        angle += (Math.random() - 0.5) * 0.15;
        
        // Charge ratio based on distance and target state
        let chargeRatio = 0.3; // Base charge
        if (dist > 300) chargeRatio = 0.5; // More charge for distance
        if (target.stunTimer > 0) chargeRatio = 0.7; // Full commit on stunned target
        if (target.isExiting) chargeRatio = 0.6;
        
        // Add some randomness
        chargeRatio += (Math.random() - 0.5) * 0.2;
        chargeRatio = Math.max(0.2, Math.min(0.8, chargeRatio));
        
        return { shouldShoot: true, angle, chargeRatio };
    }

    /**
     * Check if a position is inside or very close to an obstacle
     */
    isInsideObstacle(x, y, margin = 20) {
        for (const o of state.obstacles) {
            if (Math.hypot(x - o.x, y - o.y) < o.radius + margin) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if line of sight to target is blocked by obstacle
     */
    isObstructed(target) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy);
        
        for (const o of state.obstacles) {
            // Check if obstacle is between us and target
            const ox = o.x - this.x;
            const oy = o.y - this.y;
            
            // Project obstacle center onto line to target
            const t = Math.max(0, Math.min(1, (ox * dx + oy * dy) / (dist * dist)));
            const closestX = t * dx;
            const closestY = t * dy;
            
            const distToLine = Math.hypot(ox - closestX, oy - closestY);
            if (distToLine < o.radius + 20) {
                return true;
            }
        }
        return false;
    }

    /**
     * Trigger a bot dash in a specific direction
     */
    triggerBotDash(angle) {
        if (this.dashCooldown > 0 || this.stunTimer > 0) return;
        
        // Bots use medium charge (0.5 ratio)
        const chargeRatio = 0.5;
        const cost = Math.floor(
            CONFIG.dashMinCost + (CONFIG.dashMaxCost - CONFIG.dashMinCost) * chargeRatio
        );
        
        if (this.balance - cost <= CONFIG.minBalance) return;
        
        // Apply cost
        this.balance -= cost;
        state.worldReserve += cost;
        
        // Medium-strength dash
        const force = CONFIG.dashBaseForce + (CONFIG.dashMaxForce - CONFIG.dashBaseForce) * chargeRatio;
        
        this.vx += Math.cos(angle) * force;
        this.vy += Math.sin(angle) * force;
        
        this.invulnTimer = TIMER_TICKS.invulnDuration;
        this.dashActiveTimer = TIMER_TICKS.dashActiveDuration;
        this.dashCooldown = TIMER_TICKS.dashCooldown;
        
        this.scaleX = 1.6;
        this.scaleY = 0.5;
        addShake(8, this.x, this.y, false);
        createParticles(this.x, this.y, 4, COLORS.white, 5);
        addShockwave(this.x, this.y, 40);
        Audio.dash();
    }

    /**
     * Bot target selection - smarter priority system
     */
    selectTarget(isLowHealth = false, isWealthy = false) {
        let bestScore = -Infinity;
        let bestEnt = null;
        let fallbackFood = null;
        let fallbackFoodDist = Infinity;

        state.entities.forEach(e => {
            if (e === this || e.dead) return;
            
            // Skip blacklisted targets (ones we got stuck trying to reach)
            if (this.blacklistedTargets && this.blacklistedTargets.has(e.id)) return;
            
            // Skip food/spills that are inside obstacles (unreachable)
            if ((e.type === 'food' || e.type === 'spill') && this.isInsideObstacle(e.x, e.y)) return;
            
            const dist = Math.hypot(e.x - this.x, e.y - this.y);
            
            // Track closest food as fallback (global search, skip blacklisted)
            if (e.type === 'food' && dist < fallbackFoodDist && 
                !(this.blacklistedTargets && this.blacklistedTargets.has(e.id))) {
                fallbackFood = e;
                fallbackFoodDist = dist;
            }
            
            // Detection range for priority targets
            let maxDist = 1000; // Increased from 800
            if ((e.type === 'player' || e.type === 'bot') && e.isExiting) {
                const beaconRange = CONFIG.exitBeaconBaseRange + e.radius * CONFIG.exitBeaconRangePerRadius;
                maxDist = Math.max(maxDist, beaconRange);
            }
            // Food and spills can be detected further
            if (e.type === 'food' || e.type === 'spill') {
                maxDist = 1500;
            }
            if (dist > maxDist) return;

            let score = 0;
            
            // === SPILLS (owned by us = high priority) ===
            if (e.type === 'spill') {
                const ticksSinceSpawn = getCurrentTick() - e.spawnTick;
                if (e.ownerId === this.id) {
                    // Our spill! High priority to collect
                    score = 1500 - dist * 0.3;
                } else if (e.ownerId && ticksSinceSpawn < TIMER_TICKS.lootOwnership) {
                    score = -1000; // Locked by someone else
                } else {
                    score = 800 - dist * 0.3;
                }
            }
            // === FOOD ===
            else if (e.type === 'food') {
                score = 600 - dist * 0.3; // Increased base score, less distance penalty
                // Prioritize food when low health (safe income)
                if (isLowHealth) score += 400;
            }
            // === HOSTILE ENTITIES ===
            else if (e.type === 'player' || e.type === 'bot') {
                // Exiting targets = highest priority (free money!)
                if (e.isExiting) {
                    const beaconRange = CONFIG.exitBeaconBaseRange + e.radius * CONFIG.exitBeaconRangePerRadius;
                    if (dist < beaconRange) score = 3000 - dist;
                }
                // Stunned targets = easy kill
                else if (e.stunTimer > 0) {
                    score = 2500 - dist;
                }
                // Weaker targets = good opportunity
                else if (e.balance < this.balance * 0.7) {
                    score = 1200 - dist;
                }
                // Equal/stronger targets = only if we're healthy
                else if (!isLowHealth && e.balance < this.balance * 1.3) {
                    score = 600 - dist;
                }
                // Much stronger targets = avoid unless we're wealthy
                else if (isWealthy || e.balance > this.balance * 1.5) {
                    score = -500; // Avoid
                }
                
                // Bonus for targets in shoot recovery (vulnerable)
                if (e.shootRecoveryTimer > 0) score += 200;
                
                // Penalty for targets with active dash (dangerous)
                if (e.dashActiveTimer > 0) score -= 400;
            }

            if (score > bestScore) {
                bestScore = score;
                bestEnt = e;
            }
        });

        // If no good target found, use fallback food
        if (!bestEnt && fallbackFood) {
            bestEnt = fallbackFood;
        }

        this.target = bestEnt;
    }

    /**
     * Fire projectile
     * @param {number} angle - Fire direction
     * @param {number} chargeRatio - 0-1 charge amount
     */
    shoot(angle, chargeRatio) {
        if (this.stunTimer > 0 || this.fireCooldown > 0) return;

        // Cost scales with charge: min cost for tap shots, max cost for full charge
        const cost = Math.floor(
            CONFIG.shootMinCost + (CONFIG.shootMaxCost - CONFIG.shootMinCost) * chargeRatio
        );

        if (this.balance - cost <= CONFIG.minBalance) {
            if (this.type === 'player') {
                Audio.insolvent();
                const status = document.getElementById('status-msg');
                status.style.display = 'block';
                status.innerText = "INSUFFICIENT FUNDS";
                status.className = "status-insolvent";
                if (this.statusTimeout) clearTimeout(this.statusTimeout);
                this.statusTimeout = setTimeout(() => status.style.display = 'none', 1000);
            }
            return;
        }

        this.balance -= cost;
        // Conservation: shoot cost is transferred to world reserve (not deleted)
        state.worldReserve += cost;
        // Shoot cost is active revenue, so it doesn't increase passiveReserve or baseBurn
        // It simply extends the worldReserve lifespan.

        // Cooldown in ticks
        const cdTicks = TIMER_TICKS.fireCooldownMin + 
            Math.floor((TIMER_TICKS.fireCooldownMax - TIMER_TICKS.fireCooldownMin) * chargeRatio);
        this.fireCooldown = cdTicks;
        
        // === SHOOTING COMMITMENT ===
        // 1. Instant velocity cut (shooting = lose momentum)
        this.vx *= CONFIG.shootVelocityCut;
        this.vy *= CONFIG.shootVelocityCut;
        
        // 2. Cancel active dash (can't dash+shoot for free)
        if (this.dashActiveTimer > 0) {
            this.dashActiveTimer = 0;
        }
        
        // 3. Set recovery timer (reduced mobility after shooting)
        this.shootRecoveryTimer = TIMER_TICKS.shootRecoveryDuration;

        // Recoil (pushes you backward after velocity cut)
        const recoilForce = CONFIG.shootRecoilBase + (CONFIG.shootRecoilChargeScale * chargeRatio);
        // Scale inversely with radius (smaller = more recoil per shot)
        const recoilMult = 40 / Math.max(20, this.radius);
        this.vx -= Math.cos(angle) * recoilForce * recoilMult;
        this.vy -= Math.sin(angle) * recoilForce * recoilMult;

        this.scaleX = 0.8;
        this.scaleY = 1.2;

        const bx = this.x + Math.cos(angle) * (this.radius + 15);
        const by = this.y + Math.sin(angle) * (this.radius + 15);

        // Bullet damage (HP) scales with charge ratio
        const damage = Math.floor(
            (CONFIG.bulletDamageMin ?? 10) + ((CONFIG.bulletDamageMax ?? 25) - (CONFIG.bulletDamageMin ?? 10)) * chargeRatio
        );

        // Pass shooter's velocity for inheritance
        state.bullets.push(new Bullet(bx, by, angle, damage, this.id, 1.0, chargeRatio, this.vx, this.vy));
        createParticles(bx, by, 3, COLORS.warning, 2);
        Audio.shoot(chargeRatio);

        if (this.type === 'player') {
            addShake(2 + (5 * chargeRatio), this.x, this.y, true);
            state.camera.x -= Math.cos(angle) * 15 * chargeRatio;
            state.camera.y -= Math.sin(angle) * 15 * chargeRatio;
        }

        // Telegraphed shot charge ring for everyone (bots included)
        this.isChargingShot = false;
        this.shootChargeRatio = Math.max(0, Math.min(1, chargeRatio));
        this.shootChargeVisualTicks = 10; // ~0.5s at 20tps
    }

    /**
     * Apply combat damage as MONEY spill.
     * @param {number} amountCents - Damage in cents
     * @param {number} sourceId - ID of attacker
     * @param {boolean} isRam - If damage is from ramming (ignored)
     * @param {number} impactX - X position of impact (for spill spawn)
     * @param {number} impactY - Y position of impact (for spill spawn)
     */
    takeDamage(amountCents, sourceId, isRam = false, impactX = null, impactY = null) {
        if (isRam) return;
        if (this.type !== 'player' && this.type !== 'bot') return;

        let dmg = Math.floor(amountCents);
        if (!Number.isFinite(dmg) || dmg <= 0) return;

        // Cap damage to current balance (can't lose more than you have)
        dmg = Math.min(this.balance, dmg);
        if (dmg <= 0) return;

        // Record last hit info
        this.lastHitSourceId = sourceId;
        this.lastHitAmount = dmg;
        this.lastHitTick = getCurrentTick();
        this.lastDeathCause = 'bullet';
        
        // Hit indicator
        const src = state.entities.find(e => e.id === sourceId);
        if (src) {
            this.lastHitAngle = Math.atan2(src.y - this.y, src.x - this.x);
            this.hitIndicatorTimer = 12; // ~600ms at 20 tps
        }

        // Combat tag
        this.exitCombatTag = Math.max(this.exitCombatTag || 0, CONFIG.exitCombatTagTicks ?? 0);
        this.lastDamagedTick = getCurrentTick();

        // Cancel cashout
        if (this.isExiting) {
            if (this.type === 'player') logEvent('CASHOUT CANCELLED', 'danger');
            this.isExiting = false;
            this.exitProgress = 0;
        }

        // Visuals
        this.hitFlashTimer = TIMER_TICKS.hitFlashDuration;
        this.slowTimer = TIMER_TICKS.slowDuration;
        this.scaleX = 1.2;
        this.scaleY = 0.8;
        flashEntity(this, COLORS.danger, 150);
        Audio.impactAt(this.x, this.y, this.type === 'player');

        // === ECONOMY: SPILL VS BURN ===
        // Normally: 80% spilled to world, 20% burned to reserve
        // On lethal hit: 100% spilled (no burn), so kills always drop satisfying loot
        const isLethal = (this.balance - dmg) <= CONFIG.minBalance;
        let spillAmount, burnAmount;
        
        if (isLethal) {
            // Lethal hit: spill 100%, no burn
            spillAmount = dmg;
            burnAmount = 0;
        } else {
            // Normal hit: 80% spill, 20% burn
            const spillRatio = 0.8;
            spillAmount = Math.floor(dmg * spillRatio);
            burnAmount = dmg - spillAmount;
        }

        // Deduct from victim
        this.balance -= dmg;
        
        // Floating text for victim
        state.floatTexts.push(new FloatingText(this.x, this.y - this.radius * 1.2, `-${formatMoney(dmg)}`, COLORS.danger, 28));

        // Spawn spill immediately
        if (spillAmount > 0) {
            const dropX = impactX !== null ? impactX : this.x;
            const dropY = impactY !== null ? impactY : this.y;
            const attacker = state.entities.find(e => e.id === sourceId);
            const ownerId = attacker ? attacker.id : null;
            const dir = attacker ? Math.atan2(attacker.y - dropY, attacker.x - dropX) : null;
            
            spawnSpill(dropX, dropY, spillAmount, ownerId, dir);
        }

        // Add burn to reserve
        state.worldReserve += burnAmount;

        // Player feedback
        if (this.type === 'player') {
            flashDamage(Math.min(2, dmg / 500)); // Flash intensity based on $5.00 ref
            addShake(Math.min(10, 3 + (dmg / 100) * 0.5), this.x, this.y, true);
        }

        // Check for insolvency / death (at minBalance threshold)
        if (this.balance <= CONFIG.minBalance) {
            this.balance = 0;
            this.die();
        }
    }

    die() {
        this.dead = true;
        Audio.die();
        createParticles(this.x, this.y, 8, this.getColor(), 5);
        addShockwave(this.x, this.y, 80, COLORS.danger);
        
        // Spill any remaining balance (edge cases: non-bullet deaths, etc.)
        if (this.balance > 0) {
            const killer = this.lastHitSourceId ? state.entities.find(e => e.id === this.lastHitSourceId) : null;
            const ownerId = killer ? killer.id : null;
            const dir = killer ? Math.atan2(killer.y - this.y, killer.x - this.x) : null;
            spawnSpill(this.x, this.y, this.balance, ownerId, dir);
            this.balance = 0;
        }

        // Log kill event
        const killer = this.lastHitSourceId ? state.entities.find(e => e.id === this.lastHitSourceId) : null;
        const victimName = this.type === 'player' ? 'YOU' : this.name;
        const killerName = killer ? (killer.type === 'player' ? 'YOU' : killer.name) : 'Unknown';
        
        if (killer && killer.type === 'player') {
            // Player got the kill
            logEvent(`${killerName} eliminated ${victimName}`, 'exit');
        } else if (this.type === 'player') {
            // Player was killed
            logEvent(`${killerName} eliminated ${victimName}`, 'danger');
        }

        if (this.type === 'player') {
            triggerGameOver();
            addShake(40, this.x, this.y, true);
        } else if (this.type === 'bot') {
            // Respawn is handled by tick-based spawn queue (simulation.js) for determinism.
            // Schedule one respawn credit after a delay.
            if (Array.isArray(state.botSpawnQueue)) {
                state.botSpawnQueue.push(getCurrentTick() + (CONFIG.botRespawnDelayTicks ?? 40));
            }
        }
    }

    getColor() {
        // Flash color takes priority
        if (this.flashTimer > 0 && this.flashColor) {
            return this.flashColor;
        }
        if (this.hitFlashTimer > 0) return COLORS.white;
        if (this.stunTimer > 0) return COLORS.gray;
        if (this.type === 'player') return COLORS.primary;
        if (this.type === 'bot') return COLORS.danger;
        // All collectibles are green for visual coherence
        if (this.type === 'food') return COLORS.primary;
        if (this.type === 'spill') return COLORS.primary;
        return COLORS.white;
    }
    
    /**
     * Check if this spill is locked for a specific viewer
     * @param {string} viewerId - The ID of the entity trying to view/collect
     * @returns {boolean} - True if locked (viewer cannot collect)
     */
    isLockedFor(viewerId) {
        if (this.type !== 'spill') return false;
        if (!this.ownerId) return false;
        
        // Owner can always collect their own spills
        if (this.ownerId === viewerId) return false;
        
        // Check if lock period is still active
        const ticksSinceSpawn = getCurrentTick() - this.spawnTick;
        return ticksSinceSpawn < TIMER_TICKS.lootOwnership;
    }

    /**
     * Visual update - runs every render frame
     * Handles interpolation and visual-only updates
     * @param {number} alpha - Interpolation factor (0-1) between prev and current tick
     */
    updateVisuals(alpha = 1, dt = 16) {
        // Interpolate position for smooth rendering
        this.renderX = this.prevX + (this.x - this.prevX) * alpha;
        this.renderY = this.prevY + (this.y - this.prevY) * alpha;
        
        // Dynamic Squash & Stretch
        const speed = Math.hypot(this.vx, this.vy);
        const maxSpeed = 15;
        
        // Target scale based on speed (Stretch X, Squash Y)
        // Note: The renderer rotates the context to movement direction, so X is forward
        let targetScaleX = 1 + (speed / maxSpeed) * 0.3; // Stretch up to 1.3x
        let targetScaleY = 1 - (speed / maxSpeed) * 0.15; // Squash down to 0.85x
        
        // Cap deformations
        targetScaleX = Math.min(targetScaleX, 1.4);
        targetScaleY = Math.max(targetScaleY, 0.7);
        
        // Apply smooth lerp
        this.scaleX += (targetScaleX - this.scaleX) * 0.2;
        this.scaleY += (targetScaleY - this.scaleY) * 0.2;
        
        // Decrement flash timer (milliseconds-based)
        if (this.flashTimer > 0) {
            this.flashTimer -= dt;
            if (this.flashTimer <= 0) {
                this.flashTimer = 0;
                this.flashColor = null;
            }
        }
        
        // Track balance changes for delta display
        if (this.balance !== this.prevBalance) {
            this.balanceDelta = this.balance - this.prevBalance;
            this.balanceDeltaTimer = 800; // Show for 800ms
            this.balanceFlashTimer = 300; // Flash for 300ms
            this.prevBalance = this.balance;
        }
        
        // Decrement balance delta timer
        if (this.balanceDeltaTimer > 0) {
            this.balanceDeltaTimer -= dt;
        }
        if (this.balanceFlashTimer > 0) {
            this.balanceFlashTimer -= dt;
        }
    }
}
