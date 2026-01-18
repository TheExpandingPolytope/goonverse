import { SIM_CONFIG, getTargetBorderRadius } from "./config.js";
import { EngineTickResult, type EngineEvent } from "./events.js";
import { createRng, nextRange } from "./rng.js";
import {
  clamp,
  distanceSq,
  lerp,
  massToRadius,
  mobilityMultiplier,
  randomAngleRad,
  segmentCircleIntersects,
} from "./math.js";
import type {
  BulletState,
  ObstacleState,
  PickupState,
  PlayerInput,
  PlayerState,
  WorldState,
} from "./state.js";
import { SpatialGrid } from "./spatial/grid.js";

export type WorldNode =
  | {
      kind: "player";
      id: number;
      x: number;
      y: number;
      radius: number;
      mass: number;
      spawnMass?: number;
      ownerSessionId: string;
      displayName: string;
      color: { r: number; g: number; b: number };
      flags: number;
      exitProgress: number;
      vx?: number;
      vy?: number;
      aimX?: number;
      aimY?: number;
      dashChargeRatio?: number;
      shootChargeRatio?: number;
      dashCooldownTicks?: number;
      dashActiveTicks?: number;
      stunTicks?: number;
      slowTicks?: number;
      shootRecoveryTicks?: number;
      exitCombatTagTicks?: number;
      hitFlashTicks?: number;
    }
  | { kind: "bullet"; id: number; x: number; y: number; radius: number; flags: number }
  | { kind: "pellet"; id: number; x: number; y: number; radius: number; mass: number; flags: number }
  | {
      kind: "spill";
      id: number;
      x: number;
      y: number;
      radius: number;
      mass: number;
      attackerSessionId?: string;
      victimSessionId?: string;
      unlockTick?: number;
      flags: number;
    }
  | { kind: "obstacle"; id: number; x: number; y: number; radius: number; flags: number };

const FLAG_DASHING = 1 << 0;
const FLAG_STUNNED = 1 << 1;
const FLAG_EXITING = 1 << 2;

export class GameEngine {
  private nextId = 1;
  private readonly grid = new SpatialGrid(SIM_CONFIG.gridCellSize);
  private spillSpawnedThisTick = 0;

  readonly players = new Map<string, PlayerState>();
  private readonly playersById = new Map<number, PlayerState>();
  readonly bullets = new Map<number, BulletState>();
  readonly pickups = new Map<number, PickupState>();
  readonly obstacles = new Map<number, ObstacleState>();

  readonly world: WorldState = {
    tick: 0,
    rng: createRng(1),
    // Legacy rectangular bounds (derived from max border for obstacle placement)
    bounds: {
      left: -SIM_CONFIG.border.worldRadiusMax,
      right: SIM_CONFIG.border.worldRadiusMax,
      top: -SIM_CONFIG.border.worldRadiusMax,
      bottom: SIM_CONFIG.border.worldRadiusMax,
    },
    baselineSpawnMass: 0,
    // Dynamic circular border (POC parity)
    borderRadius: SIM_CONFIG.border.worldRadiusMin,
    borderTargetRadius: SIM_CONFIG.border.worldRadiusMin,
    borderVelocity: 0,
    playersInWorld: 0,
  };

  private newId(): number {
    return this.nextId++;
  }

  addPlayer(params: { sessionId: string; wallet: `0x${string}`; displayName: string; spawnMass: number }): PlayerState {
    const existing = this.players.get(params.sessionId);
    if (existing) return existing;

    if (!this.world.baselineSpawnMass) this.world.baselineSpawnMass = Math.max(1, Math.floor(params.spawnMass));

    const color = this.randomColor();
    const spawnRadius = massToRadius(params.spawnMass, params.spawnMass);
    const spawn = this.findSpawnPosition(spawnRadius);
    const player: PlayerState = {
      id: this.newId(),
      sessionId: params.sessionId,
      wallet: params.wallet,
      displayName: params.displayName,
      x: spawn.x,
      y: spawn.y,
      prevX: 0,
      prevY: 0,
      vx: 0,
      vy: 0,
      mass: params.spawnMass,
      spawnMass: params.spawnMass,
      radius: spawnRadius,
      color,
      alive: true,
      input: this.defaultInput(),
      prevInput: this.defaultInput(),
      edges: {
        shootPressed: false,
        shootReleased: false,
        dashPressed: false,
        dashReleased: false,
        exitPressed: false,
        exitReleased: false,
      },
      shootHoldTicks: 0,
      shootChargeRatio: 0,
      shootChargeVisualTicks: 0,
      shootRecoveryTicks: 0,
      fireCooldownTicks: 0,
      dashHoldTicks: 0,
      dashActiveTicks: 0,
      dashCooldownTicks: 0,
      invulnTicks: 0,
      stunTicks: 0,
      stunGraceTicks: 0,
      slowTicks: 0,
      magnetBoostTicks: 0,
      exitCombatTagTicks: 0,
      hitFlashTicks: 0,
      baseTaxCarry: 0,
      exitHoldTicks: 0,
      exitProgress: 0,
      exitSafeHoldTicks: 0,
      exitAttemptId: 0,
    };

    player.prevX = player.x;
    player.prevY = player.y;
    this.players.set(player.sessionId, player);
    this.playersById.set(player.id, player);
    return player;
  }

  getPlayer(sessionId: string): PlayerState | undefined {
    return this.players.get(sessionId);
  }

  findPlayerByWallet(wallet: `0x${string}`): PlayerState | undefined {
    const w = wallet.toLowerCase();
    for (const p of this.players.values()) {
      if (p.wallet.toLowerCase() === w) return p;
    }
    return undefined;
  }

  rekeyPlayerSession(oldSessionId: string, newSessionId: string): boolean {
    const p = this.players.get(oldSessionId);
    if (!p) return false;
    if (oldSessionId === newSessionId) return true;
    this.players.delete(oldSessionId);
    p.sessionId = newSessionId;
    this.players.set(newSessionId, p);
    return true;
  }

  removePlayer(sessionId: string): void {
    const p = this.players.get(sessionId);
    if (p) this.playersById.delete(p.id);
    this.players.delete(sessionId);
  }

  getPlayerTotalMass(sessionId: string): number {
    const p = this.players.get(sessionId);
    return p?.mass ?? 0;
  }

  setInput(sessionId: string, input: Partial<PlayerInput>) {
    const p = this.players.get(sessionId);
    if (!p) return;
    p.input = { ...p.input, ...input };
  }

  markDisconnected(sessionId: string, tick: number) {
    const p = this.players.get(sessionId);
    if (!p) return;
    p.disconnectedAtTick = tick;
  }

  seedRng(seed: number) {
    this.world.rng = createRng(seed);
  }

  initializeObstacles(count: number) {
    const target = Math.max(0, Math.floor(count));
    if (target <= 0) return;
    const minR = SIM_CONFIG.obstacles.minRadius;
    const maxR = SIM_CONFIG.obstacles.maxRadius;
    const padding = SIM_CONFIG.obstacles.spawnPadding;
    const centerBiasExp = SIM_CONFIG.obstacles.spawnCenterBiasExp;
    const minDistFromCenter = SIM_CONFIG.obstacles.spawnMinDistFromCenter;
    // Use max border radius for obstacle placement (they're static)
    const maxSpawnRadius = SIM_CONFIG.border.worldRadiusMax * SIM_CONFIG.obstacles.spawnMaxRadiusFrac;
    
    let attempts = 0;
    let placed = 0;

    while (placed < target && attempts < SIM_CONFIG.obstacles.maxAttempts) {
      attempts += 1;
      const radius = lerp(minR, maxR, nextRange(this.world.rng, 0, 1));
      // POC parity: center-biased spawn in circular world
      const angle = nextRange(this.world.rng, 0, Math.PI * 2);
      // Center bias: use power curve to bias toward center
      const t = Math.pow(nextRange(this.world.rng, 0, 1), 1 / centerBiasExp);
      const dist = lerp(minDistFromCenter, maxSpawnRadius - radius - padding, t);
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;

      let ok = true;
      for (const o of this.obstacles.values()) {
        const rr = radius + o.radius + padding;
        if (distanceSq(x, y, o.x, o.y) < rr * rr) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const id = this.newId();
      this.obstacles.set(id, { id, x, y, radius });
      placed += 1;
    }
  }

  private findSpawnPosition(radius: number): { x: number; y: number } {
    const padding = SIM_CONFIG.spawnSafetyPadding;
    const maxAttempts = 80;
    // Use circular border for spawn (POC parity)
    const spawnMaxRadius = Math.max(100, this.world.borderRadius * 0.8 - radius - padding);
    
    for (let i = 0; i < maxAttempts; i++) {
      // Random point in circle
      const angle = nextRange(this.world.rng, 0, Math.PI * 2);
      const dist = nextRange(this.world.rng, 0, spawnMaxRadius);
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;
      
      let ok = true;
      for (const o of this.obstacles.values()) {
        const rr = radius + o.radius + padding;
        if (distanceSq(x, y, o.x, o.y) < rr * rr) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const rr = radius + p.radius + padding;
        if (distanceSq(x, y, p.x, p.y) < rr * rr) {
          ok = false;
          break;
        }
      }
      if (ok) return { x, y };
    }
    // Fallback: random point in spawn area
    const angle = nextRange(this.world.rng, 0, Math.PI * 2);
    const dist = nextRange(this.world.rng, 0, spawnMaxRadius);
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
    };
  }

  private getPlayersSorted(): PlayerState[] {
    return [...this.players.values()].sort((a, b) => a.id - b.id);
  }

  private getBulletsSorted(): BulletState[] {
    return [...this.bullets.values()].sort((a, b) => a.id - b.id);
  }

  /**
   * Update dynamic circular border (POC parity).
   * Called at the start of each tick.
   */
  private updateDynamicBorder(): void {
    // Count alive players
    let count = 0;
    for (const p of this.players.values()) {
      if (p.alive) count++;
    }
    this.world.playersInWorld = count;

    // Calculate target radius
    const target = getTargetBorderRadius(count);
    this.world.borderTargetRadius = target;

    // Move border towards target at capped speed
    const maxDelta = SIM_CONFIG.border.changeSpeedPerTick;
    const prev = this.world.borderRadius;
    const delta = clamp(target - prev, -maxDelta, maxDelta);
    this.world.borderRadius = prev + delta;
    this.world.borderVelocity = delta / (SIM_CONFIG.tickMs / 1000); // units/sec
  }

  /**
   * Apply circular border physics (POC parity).
   * Entities are bounced off the border, bullets outside are culled.
   */
  private applyBorderPhysics(players: PlayerState[]): void {
    const br = this.world.borderRadius;
    if (br <= 0) return;

    const retention = SIM_CONFIG.border.bounceRetention;
    // POC parity: entity velocities are ~units per 1/60s.
    // Convert border velocity (units/sec) into the same units.
    const borderVelEntityUnits = this.world.borderVelocity / 60;

    // Apply to players
    for (const p of players) {
      if (!p.alive) continue;
      const r = Math.max(0, br - p.radius);
      const d = Math.hypot(p.x, p.y);
      if (d <= r) continue;

      // Normal from center outward
      let nx = 1, ny = 0;
      if (d > 0.0001) {
        nx = p.x / d;
        ny = p.y / d;
      }

      // Snap to border
      p.x = nx * r;
      p.y = ny * r;

      // Bounce velocity off border
      const dot = p.vx * nx + p.vy * ny;
      if (dot > 0) {
        p.vx = p.vx - (1 + retention) * dot * nx;
        p.vy = p.vy - (1 + retention) * dot * ny;
      }

      // If border is shrinking, add gentle inward bias
      if (borderVelEntityUnits < 0) {
        p.vx += nx * borderVelEntityUnits;
        p.vy += ny * borderVelEntityUnits;
      }
    }

    // Apply to pickups
    for (const pickup of this.pickups.values()) {
      const r = Math.max(0, br - pickup.radius);
      const d = Math.hypot(pickup.x, pickup.y);
      if (d <= r) continue;

      let nx = 1, ny = 0;
      if (d > 0.0001) {
        nx = pickup.x / d;
        ny = pickup.y / d;
      }
      pickup.x = nx * r;
      pickup.y = ny * r;
    }

    // Cull bullets outside border
    for (const b of this.bullets.values()) {
      if (Math.hypot(b.x, b.y) > br + b.radius) {
        b.ttlTicks = 0;
      }
    }
  }

  private rebuildGrid(players: PlayerState[]) {
    this.grid.clear();
    for (const p of players) {
      if (!p.alive) continue;
      this.grid.insert("players", p.id, p.x, p.y);
    }
    for (const b of this.bullets.values()) {
      this.grid.insert("bullets", b.id, b.x, b.y);
    }
    for (const k of this.pickups.values()) {
      this.grid.insert("pickups", k.id, k.x, k.y);
    }
    for (const o of this.obstacles.values()) {
      this.grid.insert("obstacles", o.id, o.x, o.y);
    }
  }

  private resolveObstacleCollisions(players: PlayerState[]) {
    if (this.obstacles.size === 0) return;
    const maxR = SIM_CONFIG.obstacles.maxRadius + SIM_CONFIG.obstacles.spawnPadding;
    for (const p of players) {
      if (!p.alive) continue;
      const nearby = this.grid.queryCircle(p.x, p.y, p.radius + maxR, ["obstacles"]);
      nearby.sort((a, b) => a - b);
      for (const oid of nearby) {
        const o = this.obstacles.get(oid);
        if (!o) continue;
        // POC parity: slightly forgiving obstacle collision radius.
        const rr = p.radius + o.radius * 0.9;
        const dx = p.x - o.x;
        const dy = p.y - o.y;
        const distSq = dx * dx + dy * dy;
        const intersects = segmentCircleIntersects(p.prevX, p.prevY, p.x, p.y, o.x, o.y, rr);
        if (!intersects && distSq >= rr * rr) continue;
        const dist = Math.max(1e-4, Math.sqrt(distSq));
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = rr - dist;
        if (overlap > 0) {
          p.x += nx * overlap;
          p.y += ny * overlap;
        } else {
          p.x = o.x + nx * rr;
          p.y = o.y + ny * rr;
        }

        // POC parity:
        // - Dash impacts bounce elastically (retained momentum)
        // - Non-dash impacts slide along the obstacle (reduces jitter / sticky walls)
        const dot = p.vx * nx + p.vy * ny;
        if (dot < 0) {
          if (this.isDashing(p)) {
            const retention = SIM_CONFIG.dash.bounceRetention;
            p.vx = (p.vx - 2 * dot * nx) * retention;
            p.vy = (p.vy - 2 * dot * ny) * retention;
          } else {
            p.vx = p.vx - dot * nx;
            p.vy = p.vy - dot * ny;
            p.vx *= 0.98;
            p.vy *= 0.98;
          }
        }
      }
      this.clampToBounds(p);
    }
  }

  private applyPickupMagnetism(playerById: Map<number, PlayerState>) {
    if (this.pickups.size === 0) return;
    const baseRange = SIM_CONFIG.pellets.magnetRange;
    const boostRange = SIM_CONFIG.pellets.magnetBoostRange;
    const baseStrength = SIM_CONFIG.pellets.magnetStrength;
    const boostMult = SIM_CONFIG.pellets.magnetBoostMult;
    const maxRange = baseRange + boostRange;
    const maxPlayerRadius = SIM_CONFIG.radiusMax;
    const maxPickupRadius = SIM_CONFIG.pellets.pelletRadiusMax;

    for (const pickup of this.pickups.values()) {
      let best: PlayerState | null = null;
      let bestDist = Infinity;
      let bestRange = baseRange;
      let bestHasBoost = false;

      // Search radius includes player radius + pickup radius + range.
      const searchR = maxPlayerRadius + maxPickupRadius + maxRange + 80;
      const nearby = this.grid.queryCircle(pickup.x, pickup.y, searchR, ["players"]);
      nearby.sort((a, b) => a - b);
      for (const pid of nearby) {
        const p = playerById.get(pid);
        if (!p || !p.alive) continue;

        // POC parity: spill ownership lock blocks non-owners for a short window.
        if (pickup.kind === "spill") {
          const unlock = pickup.unlockTick ?? 0;
          if (pickup.attackerSessionId && pickup.attackerSessionId !== p.sessionId && this.world.tick < unlock) continue;
        }

        const hasBoost = p.magnetBoostTicks > 0;
        const range = baseRange + (hasBoost ? boostRange : 0);

        const dist = Math.hypot(p.x - pickup.x, p.y - pickup.y);
        if (dist >= p.radius + pickup.radius + range) continue;

        if (dist < bestDist) {
          best = p;
          bestDist = dist;
          bestRange = range;
          bestHasBoost = hasBoost;
        }
      }

      if (!best) continue;

      // POC parity: move once per tick, capped to avoid jitter/teleport.
      const dist = Math.max(1e-4, bestDist);
      const nx = (best.x - pickup.x) / dist;
      const ny = (best.y - pickup.y) / dist;
      const maxDist = (pickup.radius || 0) + 1 + bestRange;
      const t = clamp(1 - dist / Math.max(1, maxDist), 0, 1);
      const mult = bestHasBoost ? boostMult : 1.0;
      const maxMove = 6 * mult;
      const moveAmt = Math.min(maxMove, baseStrength * mult * (2 + 6 * t));

      pickup.x += nx * moveAmt;
      pickup.y += ny * moveAmt;

      // POC parity: Clamp to circular border
      const br = this.world.borderRadius;
      const maxBorderDist = Math.max(0, br - pickup.radius);
      const clampDist = Math.hypot(pickup.x, pickup.y);
      if (clampDist > maxBorderDist && clampDist > 0.0001) {
        const scale = maxBorderDist / clampDist;
        pickup.x *= scale;
        pickup.y *= scale;
      }
    }
  }

  step(): EngineTickResult {
    const events: EngineEvent[] = [];
    this.world.tick += 1;

    // 0. Update dynamic border (POC parity)
    this.updateDynamicBorder();

    let recycleMassTotal = 0;
    const spawnedPellets: number[] = [];
    this.spillSpawnedThisTick = 0;

    const players = this.getPlayersSorted();
    const playerById = new Map<number, PlayerState>();
    for (const p of players) {
      playerById.set(p.id, p);
      p.prevX = p.x;
      p.prevY = p.y;
    }

    // Input edges + hold ticks
    for (const p of players) {
      if (!p.alive) continue;
      this.updateInputEdges(p);
      const exitIntent = p.input.exit && p.exitCombatTagTicks <= 0;
      if (p.stunTicks > 0 || exitIntent) {
        p.shootHoldTicks = 0;
        p.dashHoldTicks = 0;
        continue;
      }
      if (p.dashCooldownTicks > 0 || p.dashActiveTicks > 0) {
        p.dashHoldTicks = 0;
      }
      if (p.fireCooldownTicks > 0) {
        p.shootHoldTicks = 0;
      } else if (p.input.shoot) {
        p.shootHoldTicks += 1;
        p.shootChargeVisualTicks = SIM_CONFIG.shooting.chargeVisualTicks;
      }
      if (p.input.dash && p.dashCooldownTicks <= 0 && p.dashActiveTicks <= 0) {
        p.dashHoldTicks += 1;
      }
    }

    const shootChargeMaxTicks = Math.max(1, Math.round(SIM_CONFIG.shooting.chargeTimeMs / SIM_CONFIG.tickMs));
    for (const p of players) {
      if (!p.alive) continue;
      if (p.shootHoldTicks > 0) {
        p.shootChargeRatio = clamp(p.shootHoldTicks / shootChargeMaxTicks, 0, 1);
      }
    }

    // Movement acceleration (POC parity).
    // NOTE: In the PoC, entity velocities are tuned in "units per 1/60s" even though the sim runs at 20Hz.
    // We replicate that by integrating positions with `tickSec * 60`.
    const tickSec = SIM_CONFIG.tickMs / 1000;
    const entityStep = tickSec * 60;
    for (const p of players) {
      if (!p.alive) continue;
      if (p.stunTicks > 0) continue;
      const exitIntent = p.input.exit && p.exitCombatTagTicks <= 0;
      if (exitIntent || p.exitHoldTicks > 0) {
        // No movement input while exiting; just strong damping.
        p.vx *= SIM_CONFIG.movement.exitDampMult;
        p.vy *= SIM_CONFIG.movement.exitDampMult;
        continue;
      }

      const dirX = (p.input.d ? 1 : 0) - (p.input.a ? 1 : 0);
      const dirY = (p.input.s ? 1 : 0) - (p.input.w ? 1 : 0);
      if (dirX === 0 && dirY === 0) continue;

      const mag = Math.hypot(dirX, dirY) || 1;
      const nX = dirX / mag;
      const nY = dirY / mag;

      // POC parity: movement commitment affects acceleration, not max speed.
      let speedMod = 1;
      if (p.dashHoldTicks > 0) speedMod *= SIM_CONFIG.dash.chargeMoveMult;
      if (p.slowTicks > 0) speedMod *= SIM_CONFIG.movement.damageSlowMult;
      if (p.shootHoldTicks > 0) speedMod *= SIM_CONFIG.shooting.chargeMoveMult;
      else if (p.shootRecoveryTicks > 0) speedMod *= SIM_CONFIG.shooting.recoveryMoveMult;

      const mobility = mobilityMultiplier(p.radius);
      const accel = SIM_CONFIG.movement.accelPerSec * tickSec * mobility * speedMod;
      p.vx += nX * accel;
      p.vy += nY * accel;
    }

    // Integrate player positions (POC parity: vx/vy are ~units per 1/60s)
    for (const p of players) {
      if (!p.alive) continue;
      p.x += p.vx * entityStep;
      p.y += p.vy * entityStep;
      this.clampToBounds(p);
    }

    // Friction + overspeed drag (POC parity: exponential friction, strong drag when above max speed)
    const frictionFactor = Math.pow(SIM_CONFIG.movement.frictionPerSec, tickSec);
    const overspeedDragFactor = Math.pow(0.1, tickSec);
    for (const p of players) {
      if (!p.alive) continue;
      p.vx *= frictionFactor;
      p.vy *= frictionFactor;
      // POC: do not apply overspeed drag while dashing
      if (p.dashActiveTicks > 0) continue;
      const mobility = mobilityMultiplier(p.radius);
      const maxSpeed = SIM_CONFIG.movement.maxSpeedBase * mobility;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > maxSpeed) {
        p.vx *= overspeedDragFactor;
        p.vy *= overspeedDragFactor;
      }
    }

    // Dash (charge, release, overheat)
    const dashChargeMaxTicks = Math.max(1, Math.round(SIM_CONFIG.dash.chargeTimeMs / SIM_CONFIG.tickMs));
    for (const p of players) {
      if (!p.alive) continue;

      if (p.dashCooldownTicks > 0) p.dashCooldownTicks -= 1;
      if (p.dashActiveTicks > 0) p.dashActiveTicks -= 1;

      const exitIntent = p.input.exit && p.exitCombatTagTicks <= 0;
      if (p.stunTicks > 0 || exitIntent || p.exitHoldTicks > 0) {
        p.dashHoldTicks = 0;
        continue;
      }

      if (p.dashHoldTicks >= dashChargeMaxTicks + SIM_CONFIG.dash.overheatTicks) {
        p.stunTicks = Math.max(p.stunTicks, SIM_CONFIG.dash.overheatStunTicks);
        p.dashHoldTicks = 0;
        p.dashActiveTicks = 0;
        p.invulnTicks = 0;
        // POC parity: overheat stun cancels other commitments.
        p.shootHoldTicks = 0;
        p.exitHoldTicks = 0;
        p.exitProgress = 0;
        p.exitSafeHoldTicks = 0;
      }

      if (p.edges.dashReleased && p.dashHoldTicks > 0 && p.dashCooldownTicks <= 0) {
        const t = clamp(p.dashHoldTicks / dashChargeMaxTicks, 0, 1);
        const costPct = lerp(SIM_CONFIG.dash.minCostPct, SIM_CONFIG.dash.maxCostPct, t);
        // POC parity: costs are stake-based (spawnMass), not a % of current balance.
        const costMass = Math.max(1, Math.floor(p.spawnMass * costPct));
        if (p.mass - costMass <= this.minBalanceMass(p)) {
          // Not enough funds to dash; do nothing (PoC plays an error sound + text).
        } else {
          const force = lerp(SIM_CONFIG.dash.baseForce, SIM_CONFIG.dash.maxForce, t);
          // POC parity: dash direction prefers WASD direction when held; otherwise uses aim.
          const moveX = (p.input.d ? 1 : 0) - (p.input.a ? 1 : 0);
          const moveY = (p.input.s ? 1 : 0) - (p.input.w ? 1 : 0);
          let dx = 0;
          let dy = 0;
          if (moveX !== 0 || moveY !== 0) {
            const mag = Math.hypot(moveX, moveY) || 1;
            dx = moveX / mag;
            dy = moveY / mag;
          } else {
            const aim = this.aimVector(p);
            dx = aim.dx;
            dy = aim.dy;
          }
          p.vx += dx * force;
          p.vy += dy * force;
          p.dashActiveTicks = SIM_CONFIG.dash.activeTicks;
          p.dashCooldownTicks = SIM_CONFIG.dash.cooldownTicks;
          p.invulnTicks = Math.max(p.invulnTicks, SIM_CONFIG.dash.invulnTicks);
          p.mass = Math.max(0, p.mass - costMass);
          recycleMassTotal += costMass;
        }
      }

      if (p.edges.dashReleased) {
        p.dashHoldTicks = 0;
      }
    }

    // Shooting
    for (const p of players) {
      const exitIntent = p.input.exit && p.exitCombatTagTicks <= 0;
      if (!p.alive || p.stunTicks > 0 || exitIntent || p.exitHoldTicks > 0 || p.fireCooldownTicks > 0) {
        if (p.edges.shootReleased) p.shootHoldTicks = 0;
        continue;
      }
      if (p.edges.shootReleased && p.shootHoldTicks > 0) {
        const tRawHold = clamp(p.shootHoldTicks / shootChargeMaxTicks, 0, 1);
        // POC parity: tap shots still have some charge (prevents "0 charge" pea shots).
        const tRaw = Math.max(0.15, tRawHold);
        const t = Math.pow(tRaw, SIM_CONFIG.shooting.bulletSpeedCurve);
        const damageMass = Math.max(
          1,
          Math.floor(p.spawnMass * lerp(SIM_CONFIG.shooting.minDamagePct, SIM_CONFIG.shooting.maxDamagePct, tRaw)),
        );
        const costPct = lerp(SIM_CONFIG.shooting.minCostPct, SIM_CONFIG.shooting.maxCostPct, tRaw);
        // POC parity: costs are stake-based (spawnMass), not a % of current balance.
        const costMass = Math.max(1, Math.floor(p.spawnMass * costPct));
        if (p.mass - costMass <= this.minBalanceMass(p)) {
          // Not enough funds to shoot; do nothing (PoC plays an error sound + status text).
          // Still clear hold state below on release.
          p.shootHoldTicks = 0;
          continue;
        }
        p.mass = Math.max(0, p.mass - costMass);
        recycleMassTotal += costMass;

        const { dx, dy } = this.aimVector(p);
        const radius = lerp(SIM_CONFIG.shooting.bulletRadiusMin, SIM_CONFIG.shooting.bulletRadiusMax, tRaw);

        // POC parity: bullets travel in units/sec; players travel in ~units per 1/60s.
        const baseSpeed = SIM_CONFIG.movement.maxSpeedBase * SIM_CONFIG.shooting.bulletSpeedBase * 60;
        const speedMult = lerp(SIM_CONFIG.shooting.bulletSpeedMinMult, SIM_CONFIG.shooting.bulletSpeedMaxMult, t);
        const speed = baseSpeed * speedMult;

        const spawnOffset = p.radius + 15;
        const bulletX = p.x + dx * spawnOffset;
        const bulletY = p.y + dy * spawnOffset;
        const vx = dx * speed + p.vx * SIM_CONFIG.shooting.velocityInherit * 60;
        const vy = dy * speed + p.vy * SIM_CONFIG.shooting.velocityInherit * 60;

        const bullet: BulletState = {
          id: this.newId(),
          x: bulletX,
          y: bulletY,
          vx,
          vy,
          radius,
          damageMass,
          ownerSessionId: p.sessionId,
          ttlTicks: SIM_CONFIG.shooting.bulletTtlTicks,
        };
        this.bullets.set(bullet.id, bullet);

        // Recoil
        const recoil = SIM_CONFIG.shooting.recoilBase + SIM_CONFIG.shooting.recoilChargeScale * tRaw;
        const recoilMult = 40 / Math.max(20, p.radius);
        p.vx *= SIM_CONFIG.shooting.velocityCut;
        p.vy *= SIM_CONFIG.shooting.velocityCut;
        p.vx -= dx * recoil * recoilMult;
        p.vy -= dy * recoil * recoilMult;

        // POC parity: shooting cancels an active dash (prevents dash+shoot for free).
        if (p.dashActiveTicks > 0) p.dashActiveTicks = 0;

        // POC parity: after release, keep a brief charge ring representing the shot.
        p.shootChargeRatio = tRaw;
        p.shootRecoveryTicks = SIM_CONFIG.shooting.recoveryTicks;
        p.shootChargeVisualTicks = SIM_CONFIG.shooting.chargeVisualTicks;
        p.fireCooldownTicks = Math.max(
          SIM_CONFIG.shooting.cooldownMinTicks,
          Math.floor(
            SIM_CONFIG.shooting.cooldownMinTicks +
              (SIM_CONFIG.shooting.cooldownMaxTicks - SIM_CONFIG.shooting.cooldownMinTicks) * tRaw,
          ),
        );
      }

      if (p.edges.shootReleased) {
        p.shootHoldTicks = 0;
      }
    }

    // Bullets movement + TTL
    for (const b of this.bullets.values()) {
      b.x += b.vx * tickSec;
      b.y += b.vy * tickSec;
      b.ttlTicks -= 1;
      // POC parity: Cull bullets beyond circular border (handled in applyBorderPhysics)
    }

    // Pickup movement (spills with initial velocity)
    for (const pickup of this.pickups.values()) {
      if (!pickup.vx && !pickup.vy) continue;
      // POC parity: pickup vx/vy are in the same "entity" units (~units per 1/60s).
      pickup.x += (pickup.vx ?? 0) * entityStep;
      pickup.y += (pickup.vy ?? 0) * entityStep;
      pickup.vx = (pickup.vx ?? 0) * frictionFactor;
      pickup.vy = (pickup.vy ?? 0) * frictionFactor;
      if (Math.abs(pickup.vx) < 0.02) pickup.vx = 0;
      if (Math.abs(pickup.vy) < 0.02) pickup.vy = 0;
      // POC parity: Clamp to circular border (handled in applyBorderPhysics)
    }

    // Update spatial grid and resolve obstacles
    this.rebuildGrid(players);
    this.resolveObstacleCollisions(players);
    // Apply circular border physics (POC parity)
    this.applyBorderPhysics(players);
    this.rebuildGrid(players);

    // Collisions: player <-> player (POC parity).
    // - Bodies cannot overlap (separation)
    // - Dash impacts can stun and apply strong bounce
    // - Otherwise use a mild elastic bounce along the collision normal
    const maxPlayerRadius = SIM_CONFIG.radiusMax;
    for (const a of players) {
      if (!a.alive) continue;
      const nearby = this.grid.queryCircle(a.x, a.y, a.radius + maxPlayerRadius + 80, ["players"]);
      nearby.sort((x, y) => x - y);
      for (const bid of nearby) {
        if (bid === a.id) continue;
        if (bid < a.id) continue; // only resolve each pair once
        const b = playerById.get(bid);
        if (!b || !b.alive) continue;

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius;
        if (dist >= minDist) continue;

        // Collision normal (from b -> a). Handle near-zero distance safely.
        let nx = 1;
        let ny = 0;
        if (dist > 1e-4) {
          nx = dx / dist;
          ny = dy / dist;
        }

        // Separate bodies
        const overlap = minDist - dist;
        a.x += nx * overlap * 0.5;
        a.y += ny * overlap * 0.5;
        b.x -= nx * overlap * 0.5;
        b.y -= ny * overlap * 0.5;

        // Save original speeds BEFORE any modification (POC parity)
        const aOriginalSpeed = Math.hypot(a.vx, a.vy);
        const bOriginalSpeed = Math.hypot(b.vx, b.vy);
        const aMom = a.mass * aOriginalSpeed;
        const bMom = b.mass * bOriginalSpeed;

        const aDashing = a.dashActiveTicks > 0;
        const bDashing = b.dashActiveTicks > 0;

        let stunTarget: PlayerState | null = null;
        let attacker: PlayerState | null = null;

        if (aDashing && !bDashing && b.stunTicks <= 0) {
          stunTarget = b;
          attacker = a;
        } else if (bDashing && !aDashing && a.stunTicks <= 0) {
          stunTarget = a;
          attacker = b;
        } else if (aDashing && bDashing) {
          if (aMom > bMom && b.stunTicks <= 0) {
            stunTarget = b;
            attacker = a;
          } else if (bMom > aMom && a.stunTicks <= 0) {
            stunTarget = a;
            attacker = b;
          }
        }

        if (stunTarget && attacker) {
          // Dash impact stun (POC parity: fixed duration)
          stunTarget.stunGraceTicks = 0;
          stunTarget.stunTicks = Math.max(stunTarget.stunTicks, 50);

          // Cancel cashout progress on stun (POC parity)
          stunTarget.exitHoldTicks = 0;
          stunTarget.exitProgress = 0;
          stunTarget.exitSafeHoldTicks = 0;

          // Cancel dash charging on the stunned target (defensive clarity)
          stunTarget.dashHoldTicks = 0;

          // Attacker ends dash and can shoot immediately (POC parity)
          attacker.fireCooldownTicks = 0;
          attacker.dashActiveTicks = 0;

          const originalAttackerSpeed = attacker === a ? aOriginalSpeed : bOriginalSpeed;
          const impactAngle = Math.atan2(stunTarget.y - attacker.y, stunTarget.x - attacker.x);

          // Strong bounces for both (POC parity)
          const targetKnockback = 12 + originalAttackerSpeed * 1.5;
          const attackerBounce = 8 + originalAttackerSpeed * 0.6;
          stunTarget.vx = Math.cos(impactAngle) * targetKnockback;
          stunTarget.vy = Math.sin(impactAngle) * targetKnockback;
          attacker.vx = -Math.cos(impactAngle) * attackerBounce;
          attacker.vy = -Math.sin(impactAngle) * attackerBounce;
        } else {
          // Standard elastic bounce (POC parity)
          const v1n = a.vx * nx + a.vy * ny;
          const v2n = b.vx * nx + b.vy * ny;
          const bounceStrength = 0.8;
          a.vx += (v2n - v1n) * bounceStrength * nx;
          a.vy += (v2n - v1n) * bounceStrength * ny;
          b.vx += (v1n - v2n) * bounceStrength * nx;
          b.vy += (v1n - v2n) * bounceStrength * ny;
        }

        this.clampToBounds(a);
        this.clampToBounds(b);
      }
    }

    // Player collisions mutate positions; rebuild grid before bullet queries.
    this.rebuildGrid(players);

    // Collisions: bullets -> obstacles/players (swept)
    const bulletsToRemove = new Set<number>();
    const damageByPlayer = new Map<number, { damage: number; attackerSessionId?: string }>();
    const bullets = this.getBulletsSorted();
    const maxObstacleRadius = SIM_CONFIG.obstacles.maxRadius;

    for (const b of bullets) {
      if (b.ttlTicks <= 0) {
        bulletsToRemove.add(b.id);
        continue;
      }
      // POC parity: bullets are integrated in units/sec.
      const prevX = b.x - b.vx * tickSec;
      const prevY = b.y - b.vy * tickSec;

      // Obstacle hit
      if (this.obstacles.size > 0) {
        const nearbyObs = this.grid.queryCircle(b.x, b.y, b.radius + maxObstacleRadius + 40, ["obstacles"]);
        nearbyObs.sort((a, c) => a - c);
        let hitObstacle = false;
        for (const oid of nearbyObs) {
          const o = this.obstacles.get(oid);
          if (!o) continue;
          const rr = b.radius + o.radius * 0.9;
          if (segmentCircleIntersects(prevX, prevY, b.x, b.y, o.x, o.y, rr)) {
            hitObstacle = true;
            break;
          }
        }
        if (hitObstacle) {
          bulletsToRemove.add(b.id);
          continue;
        }
      }

      const nearby = this.grid.queryCircle(b.x, b.y, b.radius + 120, ["players"]);
      nearby.sort((a, c) => a - c);
      for (const pid of nearby) {
        const target = playerById.get(pid);
        if (!target || !target.alive) continue;
        if (target.sessionId === b.ownerSessionId) continue;
        const r = target.radius + b.radius;
        if (!segmentCircleIntersects(prevX, prevY, b.x, b.y, target.x, target.y, r)) continue;
        const isBlocking = target.dashHoldTicks > 0 || target.invulnTicks > 0;
        if (isBlocking) {
          bulletsToRemove.add(b.id);
          break;
        }
        bulletsToRemove.add(b.id);
        const current = damageByPlayer.get(target.id) ?? {
          damage: 0,
          attackerSessionId: b.ownerSessionId,
        };
        current.damage += b.damageMass;
        if (!current.attackerSessionId) current.attackerSessionId = b.ownerSessionId;
        damageByPlayer.set(target.id, current);
        break;
      }
    }

    // Apply bullet damage (POC parity: cancels exit + applies slow/combat tag)
    const damageEntries = [...damageByPlayer.entries()].sort((a, b) => a[0] - b[0]);
    for (const [pid, dmg] of damageEntries) {
      const target = playerById.get(pid);
      if (!target || !target.alive) continue;
      const rawDamage = Math.max(0, Math.floor(dmg.damage));
      const damage = Math.min(rawDamage, Math.max(0, Math.floor(target.mass)));
      if (damage <= 0) continue;

      // POC parity: reward landing hits with a brief magnetism boost.
      const attacker = dmg.attackerSessionId ? this.players.get(dmg.attackerSessionId) : undefined;
      if (attacker && attacker.alive) {
        attacker.magnetBoostTicks = Math.max(attacker.magnetBoostTicks, 20);
      }

      // POC parity: lethal hits spill 100% (no burn); otherwise 80% spill / 20% burn.
      const minBalance = this.minBalanceMass(target);
      const isLethal = target.mass - damage <= minBalance;
      const spillMass = isLethal ? damage : Math.floor(damage * 0.8);
      const burnMass = damage - spillMass;

      target.mass = Math.max(0, target.mass - damage);
      if (isLethal) {
        // Prevent extra "death spill" later; lethal hit already spilled everything.
        target.mass = 0;
      }

      // Economy: burned portion is recycled into the server budget (funds future pellets).
      if (burnMass > 0) recycleMassTotal += burnMass;

      // POC parity: knockback on hit (direction away from attacker).
      if (attacker && attacker.alive) {
        const angle = Math.atan2(target.y - attacker.y, target.x - attacker.x);
        const damagePct = damage / Math.max(1, target.spawnMass);
        const kb = (damagePct * 8) / Math.sqrt(Math.max(1, target.radius));
        target.vx += Math.cos(angle) * kb;
        target.vy += Math.sin(angle) * kb;
      }

      target.slowTicks = Math.max(target.slowTicks, SIM_CONFIG.movement.slowDurationTicks);
      target.exitCombatTagTicks = Math.max(target.exitCombatTagTicks, SIM_CONFIG.exit.combatTagTicks);
      target.hitFlashTicks = SIM_CONFIG.pellets.hitFlashTicks;

      // POC parity: taking damage cancels cashout progress immediately.
      if (this.isExiting(target)) {
        target.exitHoldTicks = 0;
        target.exitProgress = 0;
        target.exitSafeHoldTicks = 0;
      }

      // Spawn spill pickups (spilled portion only)
      if (spillMass > 0) {
        this.spawnSpillFromDamage(target, spillMass, dmg.attackerSessionId);
      }
    }

    // Pickup magnetism + collection
    this.applyPickupMagnetism(playerById);
    this.rebuildGrid(players);

    const pickupsToRemove: number[] = [];
    for (const p of players) {
      if (!p.alive) continue;
      const nearby = this.grid.queryCircle(p.x, p.y, p.radius + SIM_CONFIG.pellets.magnetRange + 120, ["pickups"]);
      nearby.sort((a, b) => a - b);
      for (const pid of nearby) {
        const pickup = this.pickups.get(pid);
        if (!pickup) continue;

        // POC parity: spill ownership lock blocks non-owners until unlock.
        if (pickup.kind === "spill") {
          const unlock = pickup.unlockTick ?? 0;
          if (pickup.attackerSessionId && pickup.attackerSessionId !== p.sessionId && this.world.tick < unlock) continue;
        }

        // Collect on touch (no magnet range for collection).
        const rr = p.radius + pickup.radius;
        if (distanceSq(p.x, p.y, pickup.x, pickup.y) > rr * rr) continue;

        // POC parity: prevent instant spill pickups (readability).
        if (pickup.kind === "spill" && this.world.tick - pickup.spawnTick < SIM_CONFIG.pellets.spillPickupDelayTicks) continue;

        p.mass += pickup.mass;
        pickupsToRemove.push(pickup.id);
      }
    }
    for (const id of pickupsToRemove) this.pickups.delete(id);

    // Exit progress update + completion (POC parity: fixed-tick hold-to-exit)
    const exitDurationTicks = SIM_CONFIG.exit.durationTicks;
    for (const p of players) {
      if (!p.alive) continue;

      // POC parity: stun cancels cashout progress.
      if (p.stunTicks > 0) {
        if (p.exitHoldTicks > 0) {
          p.exitHoldTicks = 0;
          p.exitProgress = 0;
          p.exitSafeHoldTicks = 0;
        }
        continue;
      }

      if (p.input.exit) {
        if (p.exitCombatTagTicks > 0) {
          // Combat-tagged: do not allow exit progress (and cancel any existing attempt).
          if (p.exitHoldTicks > 0) {
            p.exitHoldTicks = 0;
            p.exitProgress = 0;
            p.exitSafeHoldTicks = 0;
          }
          continue;
        }

        p.exitHoldTicks += 1;
        p.dashActiveTicks = 0;
        p.dashHoldTicks = 0;
        p.shootHoldTicks = 0;

        p.exitProgress = clamp(p.exitHoldTicks / exitDurationTicks, 0, 1);
        if (p.exitHoldTicks >= exitDurationTicks) {
          p.exitAttemptId += 1;
          events.push({ type: "playerExited", sessionId: p.sessionId });
          p.alive = false;
        }
      } else if (p.exitHoldTicks > 0) {
        // Released Q: cancel exit.
        p.exitHoldTicks = 0;
        p.exitProgress = 0;
        p.exitSafeHoldTicks = 0;
      }
    }

    // Economy: passive tax (POC parity: runs once per second with carry)
    if (this.world.tick % 20 === 0) {
      const denom = SIM_CONFIG.economy.baseTaxPerSecDenom;
      const num = SIM_CONFIG.economy.baseTaxPerSecNumerator;
      for (const p of players) {
        if (!p.alive) continue;

        // Base tax: fixed-point carry so it scales smoothly.
        p.baseTaxCarry += p.spawnMass * num;
        const baseTax = Math.floor(p.baseTaxCarry / denom);
        p.baseTaxCarry = p.baseTaxCarry % denom;

        // Wealth tax (profit-only), applied once per second.
        const profit = Math.max(0, p.mass - p.spawnMass);
        const wealthTax = Math.floor(profit * SIM_CONFIG.economy.wealthTaxRate);

        const totalTax = baseTax + wealthTax;
        const taxPaid = Math.min(totalTax, p.mass);
        if (taxPaid > 0) {
          p.mass = Math.max(0, p.mass - taxPaid);
          recycleMassTotal += taxPaid;
        }

        // Liquidation: if you're below the floor, remaining balance is forfeit (burned), no spill.
        if (p.mass <= this.minBalanceMass(p)) {
          if (p.mass > 0) recycleMassTotal += p.mass;
          p.mass = 0;
        }
      }
    }

    // Spawns: pellets (budget-gated at room level)
    if (this.world.tick % SIM_CONFIG.pellets.spawnIntervalTicks === 0) {
      const spawned = this.spawnPellets();
      spawnedPellets.push(...spawned);
    }

    // Cleanup bullets
    for (const id of bulletsToRemove) this.bullets.delete(id);
    for (const [id, b] of this.bullets.entries()) {
      if (b.ttlTicks <= 0) this.bullets.delete(id);
    }

    // Cleanup dead players (spill remaining mass)
    const deadToRemove: string[] = [];
    for (const p of players) {
      if (!p.alive) continue;
      if (p.mass <= this.minBalanceMass(p)) {
        this.spawnSpillFromDeath(p);
        p.alive = false;
        events.push({ type: "playerDied", sessionId: p.sessionId });
        deadToRemove.push(p.sessionId);
      }
    }
    for (const id of deadToRemove) this.removePlayer(id);

    // Disconnect grace expiry
    const toRemove: string[] = [];
    for (const p of players) {
      if (!p.alive) continue;
      if (p.disconnectedAtTick == null) continue;
      if (this.world.tick - p.disconnectedAtTick >= SIM_CONFIG.reconnectGraceTicks) {
        this.spawnSpillFromDeath(p);
        p.alive = false;
        events.push({ type: "playerDied", sessionId: p.sessionId });
        toRemove.push(p.sessionId);
      }
    }
    for (const id of toRemove) this.removePlayer(id);

    // Update radii for next tick after mass changes
    for (const p of players) {
      if (!p.alive) continue;
      p.radius = massToRadius(p.mass, p.spawnMass);
    }

    if (recycleMassTotal > 0) events.push({ type: "recycleMass", mass: recycleMassTotal });
    for (const id of spawnedPellets) {
      const pellet = this.pickups.get(id);
      if (pellet) events.push({ type: "pelletSpawned", id, mass: pellet.mass });
    }

    // Stun tick down + grace
    for (const p of players) {
      if (p.stunTicks > 0) {
        p.stunTicks -= 1;
        if (p.stunTicks <= 0) p.stunGraceTicks = SIM_CONFIG.stun.graceTicks;
      } else if (p.stunGraceTicks > 0) {
        p.stunGraceTicks -= 1;
      }
      if (p.slowTicks > 0) p.slowTicks -= 1;
      if (p.magnetBoostTicks > 0) p.magnetBoostTicks -= 1;
      if (p.shootRecoveryTicks > 0) p.shootRecoveryTicks -= 1;
      if (p.fireCooldownTicks > 0) p.fireCooldownTicks -= 1;
      if (p.exitCombatTagTicks > 0) p.exitCombatTagTicks -= 1;
      if (p.hitFlashTicks > 0) p.hitFlashTicks -= 1;
      if (p.invulnTicks > 0) p.invulnTicks -= 1;
      if (p.shootHoldTicks <= 0 && p.shootChargeVisualTicks > 0) {
        p.shootChargeVisualTicks -= 1;
      }
      if (p.shootHoldTicks <= 0 && p.shootChargeVisualTicks <= 0) {
        p.shootChargeRatio = 0;
      }
    }

    return { events };
  }

  getWorldNodes(): WorldNode[] {
    const nodes: WorldNode[] = [];
    const dashChargeMaxTicks = Math.max(1, Math.round(SIM_CONFIG.dash.chargeTimeMs / SIM_CONFIG.tickMs));
    const players = this.getPlayersSorted();
    for (const p of players) {
      if (!p.alive) continue;
      const flags = (this.isDashing(p) ? FLAG_DASHING : 0) | (p.stunTicks > 0 ? FLAG_STUNNED : 0) | (this.isExiting(p) ? FLAG_EXITING : 0);
      const dashChargeRatio = p.dashHoldTicks > 0 ? clamp(p.dashHoldTicks / dashChargeMaxTicks, 0, 1) : 0;
      const shootChargeRatio = p.shootHoldTicks > 0 || p.shootChargeVisualTicks > 0 ? p.shootChargeRatio : 0;
      nodes.push({
        kind: "player",
        id: p.id,
        x: p.x,
        y: p.y,
        radius: p.radius,
        mass: p.mass,
        spawnMass: p.spawnMass,
        ownerSessionId: p.sessionId,
        displayName: p.displayName,
        color: p.color,
        flags,
        exitProgress: p.exitProgress,
        vx: p.vx,
        vy: p.vy,
        aimX: p.input.aimX,
        aimY: p.input.aimY,
        dashChargeRatio,
        shootChargeRatio,
        dashCooldownTicks: p.dashCooldownTicks,
        dashActiveTicks: p.dashActiveTicks,
        stunTicks: p.stunTicks,
        slowTicks: p.slowTicks,
        shootRecoveryTicks: p.shootRecoveryTicks,
        exitCombatTagTicks: p.exitCombatTagTicks,
        hitFlashTicks: p.hitFlashTicks,
      });
    }
    for (const b of this.bullets.values()) {
      nodes.push({ kind: "bullet", id: b.id, x: b.x, y: b.y, radius: b.radius, flags: 0 });
    }
    for (const k of this.pickups.values()) {
      nodes.push({
        kind: k.kind,
        id: k.id,
        x: k.x,
        y: k.y,
        radius: k.radius,
        mass: k.mass,
        attackerSessionId: k.attackerSessionId,
        victimSessionId: k.victimSessionId,
        unlockTick: k.unlockTick,
        flags: 0,
      });
    }
    for (const o of this.obstacles.values()) {
      nodes.push({ kind: "obstacle", id: o.id, x: o.x, y: o.y, radius: o.radius, flags: 0 });
    }
    return nodes;
  }

  getWorldNodesInBox(box: { leftX: number; rightX: number; topY: number; bottomY: number }): WorldNode[] {
    const ids = this.grid.queryRect(box.leftX, box.topY, box.rightX, box.bottomY, [
      "players",
      "bullets",
      "pickups",
      "obstacles",
    ]);
    ids.sort((a, b) => a - b);
    const nodes: WorldNode[] = [];
    for (const id of ids) {
      const player = this.playersById.get(id);
      if (player && player.alive) {
        nodes.push({
          kind: "player",
          id: player.id,
          x: player.x,
          y: player.y,
          radius: player.radius,
          mass: player.mass,
          spawnMass: player.spawnMass,
          ownerSessionId: player.sessionId,
          displayName: player.displayName,
          color: player.color,
          flags:
            (this.isDashing(player) ? FLAG_DASHING : 0) |
            (player.stunTicks > 0 ? FLAG_STUNNED : 0) |
            (this.isExiting(player) ? FLAG_EXITING : 0),
          exitProgress: player.exitProgress,
          vx: player.vx,
          vy: player.vy,
          aimX: player.input.aimX,
          aimY: player.input.aimY,
          dashChargeRatio:
            player.dashHoldTicks > 0
              ? clamp(
                  player.dashHoldTicks / Math.max(1, Math.round(SIM_CONFIG.dash.chargeTimeMs / SIM_CONFIG.tickMs)),
                  0,
                  1,
                )
              : 0,
          shootChargeRatio: player.shootHoldTicks > 0 || player.shootChargeVisualTicks > 0 ? player.shootChargeRatio : 0,
          dashCooldownTicks: player.dashCooldownTicks,
          dashActiveTicks: player.dashActiveTicks,
          stunTicks: player.stunTicks,
          slowTicks: player.slowTicks,
          shootRecoveryTicks: player.shootRecoveryTicks,
          exitCombatTagTicks: player.exitCombatTagTicks,
          hitFlashTicks: player.hitFlashTicks,
        });
        continue;
      }
      const bullet = this.bullets.get(id);
      if (bullet) {
        nodes.push({ kind: "bullet", id: bullet.id, x: bullet.x, y: bullet.y, radius: bullet.radius, flags: 0 });
        continue;
      }
      const pickup = this.pickups.get(id);
      if (pickup) {
        nodes.push({
          kind: pickup.kind,
          id: pickup.id,
          x: pickup.x,
          y: pickup.y,
          radius: pickup.radius,
          mass: pickup.mass,
          attackerSessionId: pickup.attackerSessionId,
          victimSessionId: pickup.victimSessionId,
          unlockTick: pickup.unlockTick,
          flags: 0,
        });
        continue;
      }
      const obstacle = this.obstacles.get(id);
      if (obstacle) {
        nodes.push({ kind: "obstacle", id: obstacle.id, x: obstacle.x, y: obstacle.y, radius: obstacle.radius, flags: 0 });
      }
    }
    return nodes;
  }

  private defaultInput(): PlayerInput {
    return { w: false, a: false, s: false, d: false, aimX: 0, aimY: 0, shoot: false, dash: false, exit: false };
  }

  private updateInputEdges(p: PlayerState) {
    p.edges.shootPressed = p.input.shoot && !p.prevInput.shoot;
    p.edges.shootReleased = !p.input.shoot && p.prevInput.shoot;
    p.edges.dashPressed = p.input.dash && !p.prevInput.dash;
    p.edges.dashReleased = !p.input.dash && p.prevInput.dash;
    p.edges.exitPressed = p.input.exit && !p.prevInput.exit;
    p.edges.exitReleased = !p.input.exit && p.prevInput.exit;
    p.prevInput = { ...p.input };
  }

  private aimVector(p: PlayerState): { dx: number; dy: number } {
    const dx = p.input.aimX - p.x;
    const dy = p.input.aimY - p.y;
    const mag = Math.hypot(dx, dy);
    if (mag <= 0.001) return { dx: 1, dy: 0 };
    return { dx: dx / mag, dy: dy / mag };
  }

  private clampToBounds(p: PlayerState) {
    // Use circular border (POC parity)
    const br = this.world.borderRadius;
    const r = Math.max(0, br - p.radius);
    const d = Math.hypot(p.x, p.y);
    if (d > r && d > 0.0001) {
      const scale = r / d;
      p.x *= scale;
      p.y *= scale;
    }
  }

  private minBalanceMass(p: PlayerState): number {
    const scaled = Math.floor(p.spawnMass * SIM_CONFIG.minBalancePctOfSpawn);
    return Math.max(SIM_CONFIG.deathFloorMass, Math.max(1, scaled));
  }

  private isDashing(p: PlayerState): boolean {
    return p.dashActiveTicks > 0;
  }

  private isExiting(p: PlayerState): boolean {
    return p.exitHoldTicks > 0;
  }

  private applyStun(p: PlayerState, ticks: number) {
    if (p.stunGraceTicks > 0) return;
    p.stunTicks = Math.max(p.stunTicks, ticks);
    p.dashActiveTicks = 0;
    p.dashHoldTicks = 0;
    p.shootHoldTicks = 0;
    p.hitFlashTicks = Math.max(p.hitFlashTicks, SIM_CONFIG.pellets.hitFlashTicks);
    p.exitHoldTicks = 0;
    p.exitProgress = 0;
    p.exitSafeHoldTicks = 0;
  }

  private playerById(id: number): PlayerState | undefined {
    return this.playersById.get(id);
  }

  private randomColor(): { r: number; g: number; b: number } {
    const colorRGB: number[] = [0xff, 0x07, Math.floor(nextRange(this.world.rng, 0, 256))];
    // Deterministic shuffle (Fisher-Yates)
    for (let i = colorRGB.length - 1; i > 0; i--) {
      const j = Math.floor(nextRange(this.world.rng, 0, i + 1));
      const tmp = colorRGB[i] as number;
      colorRGB[i] = colorRGB[j] as number;
      colorRGB[j] = tmp;
    }
    return { r: colorRGB[0] ?? 0xff, g: colorRGB[1] ?? 0x07, b: colorRGB[2] ?? 0 };
  }

  private spawnPellets(): number[] {
    const pelletValue = Math.max(1, Math.floor(this.world.baselineSpawnMass * SIM_CONFIG.pellets.pelletValuePctOfSpawn));
    const maxPelletValue = Math.floor(this.world.baselineSpawnMass * SIM_CONFIG.pellets.maxPelletValueInWorldPct);
    let currentValue = 0;
    for (const p of this.pickups.values()) {
      if (p.kind === "pellet") currentValue += p.mass;
    }
    if (currentValue >= maxPelletValue) return [];

    const remainingValue = Math.max(0, maxPelletValue - currentValue);
    const maxSpawn = Math.min(
      SIM_CONFIG.pellets.spawnPerInterval,
      Math.floor(remainingValue / Math.max(1, pelletValue)),
    );
    
    // POC parity: spawn pellets within circular border, center-biased
    const spawnMaxRadius = Math.max(100, this.world.borderRadius * 0.7);
    const spawned: number[] = [];
    
    for (let i = 0; i < maxSpawn; i++) {
      const id = this.newId();
      const radius = lerp(
        SIM_CONFIG.pellets.pelletRadiusMin,
        SIM_CONFIG.pellets.pelletRadiusMax,
        nextRange(this.world.rng, 0, 1),
      );
      // Center-biased spawn in circle
      const angle = nextRange(this.world.rng, 0, Math.PI * 2);
      const t = Math.pow(nextRange(this.world.rng, 0, 1), 1 / 2.2); // center bias
      const dist = t * spawnMaxRadius;
      
      const pellet: PickupState = {
        id,
        kind: "pellet",
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        radius,
        mass: pelletValue,
        spawnTick: this.world.tick,
      };
      this.pickups.set(id, pellet);
      spawned.push(id);
    }
    return spawned;
  }

  private spawnSpillFromDamage(target: PlayerState, damageMass: number, attackerSessionId?: string) {
    if (damageMass <= 0) return;
    const remaining = SIM_CONFIG.pellets.spillMaxPickupsPerTick - this.spillSpawnedThisTick;
    if (remaining <= 0) return;
    const count = Math.min(this.spillDropCount(damageMass), remaining);
    const per = Math.floor(damageMass / count);
    let remainder = damageMass - per * count;
    const attacker = attackerSessionId ? this.players.get(attackerSessionId) : undefined;
    const directionAngle =
      attacker && attacker.alive ? Math.atan2(attacker.y - target.y, attacker.x - target.x) : null;
    for (let i = 0; i < count; i++) {
      const mass = per + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      this.spawnSpill(target.x, target.y, mass, attackerSessionId, target.sessionId, directionAngle);
    }
  }

  private spawnSpillFromDeath(target: PlayerState) {
    this.spawnSpillFromDamage(target, target.mass, target.sessionId);
  }

  private spillDropCount(totalMass: number): number {
    const spawnMass = Math.max(1, this.world.baselineSpawnMass);
    const cap = Math.max(1, SIM_CONFIG.pellets.spillMaxPickupsPerEvent);
    if (totalMass <= 0.25 * spawnMass) return Math.min(1, cap);
    if (totalMass <= 0.75 * spawnMass) return Math.min(2, cap);
    return Math.min(3, cap);
  }

  private spawnSpill(
    x: number,
    y: number,
    mass: number,
    attackerSessionId?: string,
    victimSessionId?: string,
    directionAngle: number | null = null,
  ) {
    const id = this.newId();
    // POC parity: if we know the attacker direction, spray spills in a cone toward them.
    let angle = randomAngleRad(this.world.rng);
    if (typeof directionAngle === "number" && Number.isFinite(directionAngle)) {
      const coneRad = (SIM_CONFIG.spill.ejectConeDeg / 180) * Math.PI;
      const spread = (nextRange(this.world.rng, 0, 1) - 0.5) * coneRad;
      angle = directionAngle + spread;
    }
    const dist = lerp(
      SIM_CONFIG.spill.ejectDistMin,
      SIM_CONFIG.spill.ejectDistMax,
      nextRange(this.world.rng, 0, 1),
    );
    const spawnX = x + Math.cos(angle) * dist;
    const spawnY = y + Math.sin(angle) * dist;
    const radius = lerp(
      SIM_CONFIG.pellets.pelletRadiusMin,
      SIM_CONFIG.pellets.pelletRadiusMax,
      nextRange(this.world.rng, 0, 1),
    );
    const speed = lerp(
      SIM_CONFIG.spill.ejectSpeedMin,
      SIM_CONFIG.spill.ejectSpeedMax,
      nextRange(this.world.rng, 0, 1),
    );
    const pickup: PickupState = {
      id,
      kind: "spill",
      x: spawnX,
      y: spawnY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      mass,
      attackerSessionId,
      victimSessionId,
      unlockTick: this.world.tick + SIM_CONFIG.pellets.spillUnlockTicks,
      spawnTick: this.world.tick,
    };
    this.pickups.set(id, pickup);
    this.spillSpawnedThisTick += 1;
  }

  private enemyInExitRange(p: PlayerState): boolean {
    const range = SIM_CONFIG.exit.beaconBaseRange + p.radius * SIM_CONFIG.exit.beaconRangePerRadius;
    const nearby = this.grid.queryCircle(p.x, p.y, range, ["players"]);
    nearby.sort((a, b) => a - b);
    for (const id of nearby) {
      const other = this.playerById(id);
      if (!other || !other.alive) continue;
      if (other.sessionId === p.sessionId) continue;
      return true;
    }
    return false;
  }
}
