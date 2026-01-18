import { Room, Client } from "colyseus";
import { GameState, type SpawnOptions } from "./schema/GameState.js";
import { PROTOCOL_VERSION, type InputMessage, type WorldDeltaDto, type WorldInitDto, type NodeDto } from "./protocol.js";
import { verifyPrivyToken, getPrivyUser, getPrimaryWallet, type PrivyClaims } from "../auth/privy.js";
import { getServer, serverIdToBytes32 } from "../services/ponder.js";
import {
  generateSessionId,
  massToPayoutAmount,
  payoutAmountToMass,
} from "../services/exitController.js";
import { ledger, serverId, signingConfig } from "../services/accounts.js";
import { config } from "../config.js";
import type { PlayerUserData, AuthContext } from "../types.js";
import type { SerializedExitTicket } from "@goonverse/accounts";

// Shooter simulation engine
import { SIM_CONFIG } from "./sim/config.js";
import { GameEngine, type WorldNode } from "./sim/engine.js";
import type { PlayerState } from "./sim/state.js";

/**
 * Main game room
 * 
 * Handles:
 * - Privy JWT authentication in onAuth
 * - Deposit verification in onJoin
 * - Full physics-based gameplay
 * - Exit flow with hold-to-exit and ticket generation
 * 
 * Room metadata is automatically included in matchMaker.query() results
 * when using RedisDriver for cross-machine room discovery.
 */
// Default buy-in for development when Ponder isn't available (0.01 ETH in wei)
const DEV_DEFAULT_BUY_IN_WEI = "10000000000000000"; // 0.01 ETH

export class GameRoom extends Room<GameState> {
  private exitHoldMs: number = SIM_CONFIG.exit.durationTicks * SIM_CONFIG.tickMs;
  private massPerEth: number = 100;
  private sessionNonce: number = 0;
  private buyInAmount: string = DEV_DEFAULT_BUY_IN_WEI;
  private rakeShareBps: number = 0;
  private worldShareBps: number = 0;
  private startedAt: number = Date.now();

  // Authoritative simulation (shooter)
  private readonly engine = new GameEngine();
  private tickCount: number = 0;

  // Best-parity visibility: per-client visible sets + deltas
  private readonly prevVisibleIdsBySession = new Map<string, Set<number>>();

  // Input tracking (stale input handling)
  private readonly lastInputTickBySession = new Map<string, number>();

  // Cached balances for metadata
  private cachedPelletReserveWei: bigint = 0n;
  private spawnCostWei: bigint = 0n;

  private sanitizeDisplayName(input: unknown): string | null {
    if (typeof input !== "string") return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    // Allow letters/numbers/basic punctuation and spaces. Keep it simple and safe.
    const cleaned = trimmed.replace(/[^\p{L}\p{N} _.\-@]/gu, "");
    const limited = cleaned.slice(0, 24).trim();
    return limited.length > 0 ? limited : null;
  }

  private deriveFallbackDisplayName(wallet: string): string {
    const w = wallet?.toLowerCase() ?? "";
    if (w.startsWith("0x") && w.length >= 10) return `${w.slice(0, 6)}...${w.slice(-4)}`;
    return "player";
  }

  /**
   * Authenticate the client before allowing them to join
   * 
   * Verifies the Privy JWT access token and extracts user claims.
   * Rejects immediately if token is invalid/expired.
   */
  static async onAuth(
    token: string,
    _request: unknown
  ): Promise<AuthContext> {
    // Verify the Privy access token
    const claims = await verifyPrivyToken(token);
    if (!claims) {
      throw new Error("Invalid or expired access token");
    }

    // Get the user's wallet address
    const user = await getPrivyUser(claims.userId);
    const wallet = getPrimaryWallet(user);

    return {
      privyClaims: claims,
      wallet,
    };
  }

  /**
   * Called when the room is created
   */
  async onCreate(_options: Record<string, unknown>) {
    // Keep rooms alive between players so discovery is never empty
    this.autoDispose = false;
    this.startedAt = Date.now();
    // Initialize state
    this.setState(new GameState());
    this.state.serverId = config.serverId;
    this.state.tickRate = Math.round(1000 / SIM_CONFIG.tickMs);
    // POC parity: World size derived from max border radius (circular world)
    this.state.worldWidth = SIM_CONFIG.border.worldRadiusMax * 2;
    this.state.worldHeight = SIM_CONFIG.border.worldRadiusMax * 2;
    this.state.massScale = SIM_CONFIG.massScale;

    // Load server config from indexer (falls back to development defaults if unavailable)
    const serverConfig = await getServer(config.serverId);
    if (serverConfig) {
      this.exitHoldMs = serverConfig.exitHoldMs;
      this.massPerEth = serverConfig.massPerEth;
      this.buyInAmount = serverConfig.buyInAmount;
      this.rakeShareBps = serverConfig.rakeShareBps ?? 0;
      this.worldShareBps = serverConfig.worldShareBps ?? 0;
      this.state.exitHoldMs = serverConfig.exitHoldMs;
      this.state.massPerEth = serverConfig.massPerEth;
      console.log(`[GameRoom] Loaded config from indexer: buyIn=${this.buyInAmount} massPerEth=${this.massPerEth}`);
    } else {
      console.warn(`[GameRoom] Ponder unavailable - using development defaults (buyIn=${this.buyInAmount})`);
    }

    // Precompute spawn cost in wei (net after rake/world shares). This must match indexer deposit credits.
    try {
      const buyInWei = BigInt(this.buyInAmount ?? "0");
      const rakeBps = BigInt(this.rakeShareBps ?? 0);
      const worldBps = BigInt(this.worldShareBps ?? 0);
      this.spawnCostWei = buyInWei - (buyInWei * rakeBps) / 10_000n - (buyInWei * worldBps) / 10_000n;
    } catch {
      this.spawnCostWei = 0n;
    }

    if (!this.state.exitHoldMs) {
      // Ensure state matches the active hold duration even if serverConfig is missing.
      this.state.exitHoldMs = this.exitHoldMs;
    }

    // Seed RNG deterministically from roomId
    this.engine.seedRng(this.hashSeed(this.roomId));

    await this.refreshBalancesAndMetadata();

    // Seed static obstacles
    this.engine.initializeObstacles(SIM_CONFIG.obstacles.count);

    // Register message handlers
    this.onMessage("input", (client, message: InputMessage) => {
      this.handleInput(client, message);
    });

    // Log initial state (useful to verify no pellets are pre-spawned)
    console.log(`GameRoom created for server ${config.serverId}`);

    // Set up game loop
    this.setSimulationInterval((deltaTime) => {
      this.update(deltaTime);
    }, SIM_CONFIG.tickMs);
  }

  /**
   * Called when a client joins the room
   * 
   * Handles two flows:
   * 1. Reconnect: If wallet already has a living entity, reattach to it
   * 2. Spawn: Verify deposit is unused, mark as used, then spawn
   */
  async onJoin(client: Client, options: SpawnOptions & { reconnect?: boolean }, auth: AuthContext) {
    console.log(`Client ${client.sessionId} joining with options:`, options);

    const wallet = (auth.wallet || options.wallet)?.toLowerCase() as `0x${string}`;
    if (!wallet) {
      throw new Error("No wallet provided");
    }

    if (!options.serverId) {
      throw new Error("Missing required spawn options: serverId");
    }

    // Verify serverId matches (canonicalize so callers can pass either bytes32 or a human id)
    if (serverIdToBytes32(options.serverId).toLowerCase() !== serverIdToBytes32(config.serverId).toLowerCase()) {
      throw new Error(`Invalid serverId: expected ${config.serverId}, got ${options.serverId}`);
    }

    // RECONNECT FLOW: active entity already exists for this wallet
    const existing = this.engine.findPlayerByWallet(wallet);
    if (existing && existing.alive) {
      const oldSessionId = existing.sessionId;
      console.log(`Reconnecting wallet ${wallet} from ${oldSessionId} to ${client.sessionId}`);

      this.engine.rekeyPlayerSession(oldSessionId, client.sessionId);
      existing.disconnectedAtTick = undefined;
      this.lastInputTickBySession.set(client.sessionId, this.tickCount);

      client.userData = {
        wallet,
        depositId: existing.depositId ?? (options.depositId as `0x${string}` | undefined),
        spawnMass: 0n,
        privyClaims: auth.privyClaims,
      } as PlayerUserData;

      this.sendInit(client);
      return;
    }

    // SPAWN FLOW: consume hot-ledger balance (user:pending:spawn -> server:world)
    const spawnCostWei = this.spawnCostWei;
    if (spawnCostWei <= 0n) {
      throw new Error("Server misconfigured: spawnCostWei is not set");
    }

    const ok = await ledger.transfer(
      serverId,
      `user:pending:spawn:${wallet}`,
      "server:world",
      spawnCostWei,
      `spawn:${client.sessionId}`
    );
    if (!ok) {
      throw new Error("Insufficient funds to spawn");
    }

    const spawnMass = payoutAmountToMass(spawnCostWei, this.massPerEth);

    client.userData = {
      wallet,
      depositId: options.depositId as `0x${string}` | undefined,
      spawnMass: spawnCostWei,
      privyClaims: auth.privyClaims,
    } as PlayerUserData;

    const displayName =
      this.sanitizeDisplayName((options as any).displayName) ?? this.deriveFallbackDisplayName(wallet);

    const sim = this.engine.addPlayer({
      sessionId: client.sessionId,
      wallet,
      displayName,
      spawnMass,
    });
    sim.depositId = options.depositId as `0x${string}` | undefined;
    this.lastInputTickBySession.set(client.sessionId, this.tickCount);

    console.log(`Player ${client.sessionId} spawned with mass ${spawnMass}`);
    this.sendInit(client);
  }

  /**
   * Find a player by wallet address
   */
  private getPlayerByWallet(wallet: string): PlayerState | null {
    const w = wallet.toLowerCase() as `0x${string}`;
    return this.engine.findPlayerByWallet(w) ?? null;
  }

  /**
   * Check if this room currently has a living entity for the given wallet.
   * 
   * This is exposed for remoteRoomCall from HTTP handlers (e.g., /join-eligibility)
   * so we can support reconnects without requiring a new deposit.
   */
  public hasActiveEntity(wallet: string): boolean {
    const player = this.getPlayerByWallet(wallet);
    const hasEntity = !!player && player.alive;

    if (hasEntity && player) {
      console.log(
        `[GameRoom] hasActiveEntity: wallet ${wallet} has active player ${player.sessionId} in room ${this.roomId}`,
      );
    }

    return hasEntity;
  }

  /**
   * Called when a client leaves the room
   * 
   * If consented (player intentionally left), remove immediately.
   * If not consented (disconnect), keep entity alive for reconnect window.
   */
  async onLeave(client: Client, consented: boolean) {
    const sim = this.engine.getPlayer(client.sessionId);
    if (!sim) {
      console.log(`Client ${client.sessionId} left but no sim found`);
      return;
    }

    if (consented) {
      this.removePlayer(client.sessionId);
      console.log(`Client ${client.sessionId} left intentionally, removed`);
      return;
    }

    this.engine.markDisconnected(client.sessionId, this.tickCount);
    this.engine.setInput(client.sessionId, { w: false, a: false, s: false, d: false, shoot: false, dash: false, exit: false });
    console.log(`Client ${client.sessionId} disconnected, entity kept alive for reconnect`);
  }

  /**
   * Remove a player and their blobs from the game
   */
  private removePlayer(sessionId: string) {
    this.engine.removePlayer(sessionId);
    this.prevVisibleIdsBySession.delete(sessionId);
    this.lastInputTickBySession.delete(sessionId);
  }

  /**
   * Called when the room is disposed
   */
  async onDispose() {
    console.log(`GameRoom disposed for server ${config.serverId}`);
  }

  /**
   * Handle input messages from clients
   */
  private handleInput(client: Client, message: InputMessage) {
    const sim = this.engine.getPlayer(client.sessionId);
    if (!sim || !sim.alive) return;
    const aimX = Number(message.aimX) || 0;
    const aimY = Number(message.aimY) || 0;
    // POC parity: Clamp aim within max border radius (circular world centered at 0,0)
    const maxR = SIM_CONFIG.border.worldRadiusMax;
    const clampedAimX = Math.max(-maxR, Math.min(maxR, aimX));
    const clampedAimY = Math.max(-maxR, Math.min(maxR, aimY));

    this.engine.setInput(client.sessionId, {
      w: !!message.w,
      a: !!message.a,
      s: !!message.s,
      d: !!message.d,
      aimX: clampedAimX,
      aimY: clampedAimY,
      shoot: !!message.shoot,
      dash: !!message.dash,
      exit: !!message.exit,
    });

    this.lastInputTickBySession.set(client.sessionId, this.tickCount);
  }

  /**
   * Complete the exit and generate ticket
   * 
   * Uses accounts.withdraw() which atomically:
   * 1. Transfers from server:world to user:pending:exit:<wallet>
   * 2. Signs and returns the exit ticket
   */
  private async completeExit(sessionId: string) {
    const sim = this.engine.getPlayer(sessionId);
    if (!sim) return;
    const client = this.clients.find((c) => c.sessionId === sessionId);
    if (!client) return;

    try {
      const userData = client.userData as PlayerUserData;
      const exitAttemptId = sim.exitAttemptId || ++this.sessionNonce;
      const ticketSessionId = generateSessionId(userData.wallet, exitAttemptId);

      const totalMass = this.engine.getPlayerTotalMass(client.sessionId);
      const payoutWei = massToPayoutAmount(totalMass, this.massPerEth);

      // withdraw() atomically moves funds and signs the ticket
      const ticket = await ledger.withdraw(
        serverId,
        userData.wallet,
        payoutWei,
        ticketSessionId,
        signingConfig,
        `exit:${client.sessionId}:${exitAttemptId}`
      );

      if (!ticket) {
        client.send("exitError", { message: "Server temporarily out of funds, please try again." });
        return;
      }

      // Serialize and send the ticket
      const serializedTicket: SerializedExitTicket = {
        serverId: ticket.serverId,
        sessionId: ticket.sessionId,
        player: ticket.player,
        payout: ticket.payout.toString(),
        deadline: ticket.deadline.toString(),
        signature: ticket.signature,
      };

      client.send("exitTicket", serializedTicket);
      console.log(`Player ${client.sessionId} exited with payout ${payoutWei.toString()}`);

      this.removePlayer(client.sessionId);
    } catch (error) {
      console.error(`[GameRoom] completeExit failed for ${client.sessionId}:`, error);
      client.send("exitError", { message: "Exit failed, please try again." });
    }
  }

  /**
   * Game loop update (fixed 50ms ticks).
   *
   * - Runs authoritative simulation
   * - Applies economic recycling to pelletReserveWei
   * - Sends per-client visibility deltas
   */
  private update(_deltaTime: number) {
    this.tickCount++;
    // Stale input handling (clear holds)
    for (const [sessionId, lastTick] of this.lastInputTickBySession.entries()) {
      if (this.tickCount - lastTick > SIM_CONFIG.inputStaleTicks) {
        this.engine.setInput(sessionId, { w: false, a: false, s: false, d: false, shoot: false, dash: false, exit: false });
      }
    }

    const result = this.engine.step();

    let recycledMass = 0;
    let pelletMass = 0;
    const pelletIds: number[] = [];

    for (const e of result.events) {
      if (e.type === "recycleMass") {
        recycledMass += e.mass;
      } else if (e.type === "pelletSpawned") {
        pelletMass += e.mass;
        pelletIds.push(e.id);
      } else if (e.type === "playerExited") {
        void this.completeExit(e.sessionId);
      } else if (e.type === "playerDied") {
        this.removePlayer(e.sessionId);
      }
    }

    if (recycledMass > 0) {
      const wei = massToPayoutAmount(recycledMass, this.massPerEth);
      void ledger.transfer(serverId, "server:world", "server:budget", wei, `recycle:${this.roomId}:${this.tickCount}`);
    }

    if (pelletMass > 0) {
      void this.handlePelletTransfers(pelletMass, pelletIds);
    }

    // Visibility deltas
    for (const client of this.clients) {
      this.sendVisibilityDelta(client);
    }

    // Refresh balances + metadata once per second
    if (this.tickCount % 20 === 0) {
      void this.refreshBalancesAndMetadata();
    }
  }

  private async handlePelletTransfers(totalMass: number, pelletIds: number[]) {
    const costWei = massToPayoutAmount(totalMass, this.massPerEth);
    const ok = await ledger.transfer(serverId, "server:budget", "server:world", costWei, `pellet:${this.roomId}:${this.tickCount}`);
    if (!ok) {
      for (const id of pelletIds) {
        this.engine.pickups.delete(id);
      }
    }
  }

  private buildViewBox(sim: PlayerState) {
    const cx = sim.x;
    const cy = sim.y;
    const sizeFactor = Math.min(1.4, Math.max(0.6, SIM_CONFIG.radiusAtSpawn / Math.max(1, sim.radius)));
    const radius = Math.max(
      SIM_CONFIG.viewMinRadius,
      Math.min(SIM_CONFIG.viewMaxRadius, SIM_CONFIG.viewBaseRadius * sizeFactor),
    );

    return {
      centerX: cx,
      centerY: cy,
      topY: cy - radius,
      bottomY: cy + radius,
      leftX: cx - radius,
      rightX: cx + radius,
    };
  }

  private sendVisibilityDelta(client: Client) {
    const sim = this.engine.getPlayer(client.sessionId);
    if (!sim || !sim.alive) {
      const prev = this.prevVisibleIdsBySession.get(client.sessionId);
      if (prev && prev.size > 0) {
        client.send("world:delta", { tick: this.tickCount, nodes: [], removedIds: [...prev], ownedIds: [] });
      }
      this.prevVisibleIdsBySession.set(client.sessionId, new Set());
      return;
    }

    const box = this.buildViewBox(sim);
    if (!box) return;

    const nowVisible = new Set<number>();
    const candidates: WorldNode[] = [];
    const queryBox = {
      leftX: box.leftX - 240,
      rightX: box.rightX + 240,
      topY: box.topY - 240,
      bottomY: box.bottomY + 240,
    };
    const nodes = this.engine.getWorldNodesInBox(queryBox);
    const pickupInterestRadius = SIM_CONFIG.lod.pickupInterestRadius;
    const minPickupMass = SIM_CONFIG.lod.minPickupMassForDelta;
    const pickupInterestRadiusSq = pickupInterestRadius * pickupInterestRadius;

    for (const node of nodes) {
      const margin = node.kind === "bullet" ? 200 : 0;
      if (node.y > box.bottomY + margin) continue;
      if (node.y < box.topY - margin) continue;
      if (node.x > box.rightX + margin) continue;
      if (node.x < box.leftX - margin) continue;
      if ((node.kind === "pellet" || node.kind === "spill") && node.mass < minPickupMass) {
        const dx = node.x - sim.x;
        const dy = node.y - sim.y;
        if (dx * dx + dy * dy > pickupInterestRadiusSq) continue;
      }
      candidates.push(node);
    }

    // Optional spill clustering for far range
    const clusterDtos: NodeDto[] = [];
    if (candidates.length > SIM_CONFIG.lod.maxNodesPerDelta) {
      const cellSize = SIM_CONFIG.lod.clusterCellSize;
      const clusterMinCount = SIM_CONFIG.lod.clusterMinCount;
      const clusterBase = 1_000_000_000;
      const offset = 32768;

      const kept: WorldNode[] = [];
      const buckets = new Map<
        string,
        { nodes: WorldNode[]; mass: number; count: number; sumX: number; sumY: number; id: number }
      >();

      for (const node of candidates) {
        if (node.kind === "pellet" || node.kind === "spill") {
          const dx = node.x - sim.x;
          const dy = node.y - sim.y;
          if (dx * dx + dy * dy > pickupInterestRadiusSq) {
            const cx = Math.floor(node.x / cellSize);
            const cy = Math.floor(node.y / cellSize);
            const key = `${cx},${cy}`;
            let bucket = buckets.get(key);
            if (!bucket) {
              const id = clusterBase + (cx + offset) * 65536 + (cy + offset);
              bucket = { nodes: [], mass: 0, count: 0, sumX: 0, sumY: 0, id };
              buckets.set(key, bucket);
            }
            bucket.nodes.push(node);
            bucket.mass += node.mass ?? 0;
            bucket.count += 1;
            bucket.sumX += node.x;
            bucket.sumY += node.y;
            continue;
          }
        }
        kept.push(node);
      }

      for (const bucket of buckets.values()) {
        if (bucket.count >= clusterMinCount) {
          const x = bucket.sumX / bucket.count;
          const y = bucket.sumY / bucket.count;
          const radius = Math.max(20, Math.min(100, Math.sqrt(bucket.mass)));
          clusterDtos.push({
            kind: "spillCluster",
            id: bucket.id,
            x,
            y,
            radius,
            mass: bucket.mass,
            count: bucket.count,
            flags: 0,
          });
          nowVisible.add(bucket.id);
        } else {
          kept.push(...bucket.nodes);
        }
      }
      candidates.length = 0;
      candidates.push(...kept);
    }

    // LOD cap (server-side bandwidth control)
    if (candidates.length > SIM_CONFIG.lod.maxNodesPerDelta) {
      const priority = (kind: WorldNode["kind"]) =>
        kind === "player" ? 0 : kind === "bullet" ? 1 : kind === "spill" ? 2 : kind === "pellet" ? 3 : 4;
      candidates.sort((a, b) => {
        const pa = priority(a.kind);
        const pb = priority(b.kind);
        if (pa !== pb) return pa - pb;
        return a.id - b.id;
      });
      candidates.length = SIM_CONFIG.lod.maxNodesPerDelta;
    }

    const dtos: NodeDto[] = [...clusterDtos];
    for (const node of candidates) {
      nowVisible.add(node.id);
      dtos.push(this.nodeToDto(node));
    }

    const prev = this.prevVisibleIdsBySession.get(client.sessionId) ?? new Set<number>();
    const removedIds: number[] = [];
    for (const id of prev) {
      if (!nowVisible.has(id)) removedIds.push(id);
    }

    this.prevVisibleIdsBySession.set(client.sessionId, nowVisible);

    const payload: WorldDeltaDto = {
      tick: this.tickCount,
      nodes: dtos,
      removedIds,
      ownedIds: [sim.id],
      // Dynamic border state (POC parity)
      border: {
        radius: this.engine.world.borderRadius,
        targetRadius: this.engine.world.borderTargetRadius,
        velocity: this.engine.world.borderVelocity,
      },
    };

    client.send("world:delta", payload);
  }

  private nodeToDto(node: WorldNode): NodeDto {
    if (node.kind === "player") {
      return {
        kind: "player",
        id: node.id,
        ownerSessionId: node.ownerSessionId,
        displayName: node.displayName,
        x: node.x,
        y: node.y,
        radius: node.radius,
        mass: node.mass,
        spawnMass: node.spawnMass,
        color: node.color,
        flags: node.flags,
        exitProgress: node.exitProgress,
        vx: node.vx,
        vy: node.vy,
        aimX: node.aimX,
        aimY: node.aimY,
        dashChargeRatio: node.dashChargeRatio,
        shootChargeRatio: node.shootChargeRatio,
        dashCooldownTicks: node.dashCooldownTicks,
        dashActiveTicks: node.dashActiveTicks,
        stunTicks: node.stunTicks,
        slowTicks: node.slowTicks,
        shootRecoveryTicks: node.shootRecoveryTicks,
        exitCombatTagTicks: node.exitCombatTagTicks,
        hitFlashTicks: node.hitFlashTicks,
      };
    }
    if (node.kind === "bullet") {
      return { kind: "bullet", id: node.id, x: node.x, y: node.y, radius: node.radius, flags: node.flags };
    }
    if (node.kind === "pellet") {
      return { kind: "pellet", id: node.id, x: node.x, y: node.y, radius: node.radius, mass: node.mass, flags: node.flags };
    }
    if (node.kind === "spill") {
      return {
        kind: "spill",
        id: node.id,
        x: node.x,
        y: node.y,
        radius: node.radius,
        mass: node.mass,
        attackerSessionId: node.attackerSessionId,
        victimSessionId: node.victimSessionId,
        unlockTick: node.unlockTick,
        flags: node.flags,
      };
    }
    return { kind: "obstacle", id: node.id, x: node.x, y: node.y, radius: node.radius, flags: node.flags };
  }

  private sendInit(client: Client) {
    const payload: WorldInitDto = {
      protocolVersion: PROTOCOL_VERSION,
      serverId: config.serverId,
      tickMs: SIM_CONFIG.tickMs,
      // Legacy rectangular bounds (derived from max border)
      world: {
        left: -SIM_CONFIG.border.worldRadiusMax,
        right: SIM_CONFIG.border.worldRadiusMax,
        top: -SIM_CONFIG.border.worldRadiusMax,
        bottom: SIM_CONFIG.border.worldRadiusMax,
      },
      // Dynamic circular border (POC parity)
      border: {
        radius: this.engine.world.borderRadius,
        targetRadius: this.engine.world.borderTargetRadius,
        maxRadius: SIM_CONFIG.border.worldRadiusMax,
        minRadius: SIM_CONFIG.border.worldRadiusMin,
      },
      massPerEth: this.massPerEth,
      exitHoldMs: this.exitHoldMs,
      massScale: SIM_CONFIG.massScale,
    };
    client.send("world:init", payload);
  }

  private async refreshBalancesAndMetadata() {
    try {
      this.cachedPelletReserveWei = await ledger.getBalance(serverId, "server:budget");
      this.state.worldBalance = this.cachedPelletReserveWei.toString();
      this.refreshMetadata();
    } catch (error) {
      console.warn("[GameRoom] Failed to refresh balances:", error);
    }
  }

  private hashSeed(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private refreshMetadata() {
    this.setMetadata({
      serverId: config.serverId,
      buyInAmount: this.buyInAmount,
      massPerEth: this.massPerEth,
      region: config.region,
      worldContract: config.worldContractAddress,
      worldBalance: this.state.worldBalance,
    });
  }
}
