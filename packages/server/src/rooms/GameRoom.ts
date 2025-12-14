import { Room, Client } from "colyseus";
import { 
  GameState, 
  type InputMessage, 
  type SpawnOptions 
} from "./schema/GameState.js";
import { verifyPrivyToken, getPrivyUser, getPrimaryWallet, type PrivyClaims } from "../auth/privy.js";
import { verifyDeposit, getServer, serverIdToBytes32 } from "../services/ponder.js";
import {
  createExitTicket,
  generateSessionId,
  massToPayoutAmount,
  storeExitTicket,
  payoutAmountToMass,
} from "../services/exitController.js";
import { tryUseDeposit } from "../services/depositTracker.js";
import {
  applyDepositToBalances,
  creditPelletReserveWei,
  getPelletReserveWei,
  reserveExitLiquidityWei,
  trySpendPelletReserveWei,
} from "../services/balance.js";
import { config } from "../config.js";
import type { PlayerUserData, AuthContext, SerializedExitTicket } from "../types.js";

// FFA parity simulation engine
import { FFA_CONFIG } from "./sim/config.js";
import { massToRadius } from "./sim/math.js";
import { FfaEngine } from "./sim/engine.js";
import type { PlayerSim, WorldNode } from "./sim/types.js";

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
export class GameRoom extends Room<GameState> {
  private exitHoldMs: number = 3000;
  private massPerEth: number = 100;
  private sessionNonce: number = 0;
  private buyInAmount: string = "0";
  private startedAt: number = Date.now();

  // Authoritative simulation (FFA parity)
  private readonly engine = new FfaEngine();
  private tickCount: number = 0;
  private spawnTickCount: number = 0;
  private spawnTaskInFlight: boolean = false;

  // Best-parity visibility: per-client visible sets + deltas
  private readonly prevVisibleIdsBySession = new Map<string, Set<number>>();

  // Input edge detection + exit-hold overlay
  private readonly prevKeyStateBySession = new Map<string, { space: boolean; w: boolean; q: boolean }>();
  private readonly exitHoldStartedAtBySession = new Map<string, number>();

  // Cached balances for metadata
  private cachedPelletReserveWei: bigint = 0n;

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
    this.state.tickRate = Math.round(1000 / FFA_CONFIG.tickMs);
    this.state.worldWidth = FFA_CONFIG.borderRight - FFA_CONFIG.borderLeft;
    this.state.worldHeight = FFA_CONFIG.borderBottom - FFA_CONFIG.borderTop;

    // Load server config from indexer
    const serverConfig = await getServer(config.serverId);
    if (serverConfig) {
      this.exitHoldMs = serverConfig.exitHoldMs;
      this.massPerEth = serverConfig.massPerEth;
      this.buyInAmount = serverConfig.buyInAmount;
      this.state.exitHoldMs = serverConfig.exitHoldMs;
      this.state.massPerEth = serverConfig.massPerEth;
    }

    await this.refreshBalancesAndMetadata();

    // TODO: Persist world balance on dispose
    // We should probably save the balance back to Ponder or Redis periodically or on dispose
    // For now, it's just in-memory state


    // Register message handlers
    this.onMessage("input", (client, message: InputMessage) => {
      this.handleInput(client, message);
    });

    // Log initial state (useful to verify no pellets are pre-spawned)
    console.log(`GameRoom created for server ${config.serverId}`);

    // Set up game loop
    this.setSimulationInterval((deltaTime) => {
      this.update(deltaTime);
    }, FFA_CONFIG.tickMs);

    // (Additional lifecycle logging happens in onDispose)
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
      existing.disconnectedAtMs = undefined;

      client.userData = {
        wallet,
        depositId: existing.depositId ?? (options.depositId as `0x${string}`),
        spawnMass: 0n,
        privyClaims: auth.privyClaims,
      } as PlayerUserData;

      this.sendInit(client);
      return;
    }

    // SPAWN FLOW: Need a valid, unused deposit
    if (!options.depositId) {
      throw new Error("Missing required spawn options: depositId");
    }

    const deposit = await verifyDeposit(options.serverId, options.depositId, wallet);
    if (!deposit) {
      throw new Error("Invalid or missing deposit");
    }

    const wasUnused = await tryUseDeposit(options.serverId, options.depositId);
    if (!wasUnused) {
      throw new Error("Deposit has already been used");
    }

    // Ensure pelletReserve + observed bankroll have this deposit (idempotent, centralized)
    await applyDepositToBalances({
      id: deposit.id,
      serverId: options.serverId,
      spawnAmountWei: deposit.spawnAmount,
      worldAmountWei: deposit.worldAmount,
    });

    const spawnMass = payoutAmountToMass(deposit.spawnAmount, this.massPerEth);

    client.userData = {
      wallet,
      depositId: options.depositId,
      spawnMass: deposit.spawnAmount,
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
    sim.depositId = options.depositId;

    console.log(`Player ${client.sessionId} spawned with mass ${spawnMass}`);
    this.sendInit(client);
  }

  /**
   * Find a player by wallet address
   */
  private getPlayerByWallet(wallet: string): PlayerSim | null {
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

    sim.disconnectedAtMs = Date.now();
    console.log(`Client ${client.sessionId} disconnected, entity kept alive for reconnect`);
  }

  /**
   * Remove a player and their blobs from the game
   */
  private removePlayer(sessionId: string) {
    this.engine.removePlayer(sessionId);
    this.exitHoldStartedAtBySession.delete(sessionId);
    this.prevVisibleIdsBySession.delete(sessionId);
    this.prevKeyStateBySession.delete(sessionId);
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

    const prev = this.prevKeyStateBySession.get(client.sessionId) ?? { space: false, w: false, q: false };
    const next = { space: !!message.space, w: !!message.w, q: !!message.q };
    this.prevKeyStateBySession.set(client.sessionId, next);

    // We interpret message.x/message.y as world-space mouse coordinates.
    const mouseX = Number(message.x) || 0;
    const mouseY = Number(message.y) || 0;

    this.engine.setInput(client.sessionId, {
      mouseX,
      mouseY,
      splitPressed: next.space && !prev.space,
      ejectPressed: next.w && !prev.w,
    });

    // Exit-hold overlay (economic) is tracked outside the engine
    if (next.q && !prev.q) {
      this.exitHoldStartedAtBySession.set(client.sessionId, Date.now());
    } else if (!next.q && prev.q) {
      this.exitHoldStartedAtBySession.delete(client.sessionId);
    }
  }

  /**
   * Start the exit hold countdown
   */
  private startExit(sessionId: string) {
    this.exitHoldStartedAtBySession.set(sessionId, Date.now());
  }

  /**
   * Cancel the exit hold
   */
  private cancelExit(sessionId: string) {
    this.exitHoldStartedAtBySession.delete(sessionId);
  }

  /**
   * Complete the exit and generate ticket
   */
  private async completeExit(client: Client) {
    const sim = this.engine.getPlayer(client.sessionId);
    if (!sim || !sim.alive) return;

    const userData = client.userData as PlayerUserData;
    const sessionId = generateSessionId(userData.wallet, ++this.sessionNonce);

    const totalMass = this.engine.getPlayerTotalMass(client.sessionId);
    const payoutWei = massToPayoutAmount(totalMass, this.massPerEth);

    const reserved = await reserveExitLiquidityWei({
      serverId: config.serverId,
      sessionId,
      payoutWei,
      ttlSeconds: config.exitTicketTtlSeconds,
    });

    if (!reserved) {
      client.send("exitError", { message: "Server temporarily out of funds, please try again." });
      this.cancelExit(client.sessionId);
      return;
    }

    const ticket = await createExitTicket(sessionId, userData.wallet, payoutWei);
    await storeExitTicket(this.presence, ticket);

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

    sim.alive = false;
    this.removePlayer(client.sessionId);
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
    this.spawnTickCount++;

    const result = this.engine.step();

    // Recycle: decay + ejected-fed-to-virus return value to pellet reserve
    let recycledMass = 0;
    for (const e of result.events) {
      if (e.type === "massDecayed" || e.type === "ejectedFedVirus") {
        recycledMass += e.mass;
      }
    }
    if (recycledMass > 0) {
      const wei = massToPayoutAmount(recycledMass, this.massPerEth);
      void creditPelletReserveWei(config.serverId, wei);
    }

    // Spawn schedule (every 20 ticks): budgeted pellets + virus floor
    if (this.spawnTickCount >= FFA_CONFIG.spawnIntervalTicks) {
      this.spawnTickCount = 0;
      if (!this.spawnTaskInFlight) {
        this.spawnTaskInFlight = true;
        void this.spawnTickTasks().finally(() => {
          this.spawnTaskInFlight = false;
        });
      }
    }

    // Exit-hold completion
    for (const [sessionId, startedAt] of [...this.exitHoldStartedAtBySession.entries()]) {
      const elapsed = Date.now() - startedAt;
      if (elapsed < this.exitHoldMs) continue;
      const client = this.clients.find((c) => c.sessionId === sessionId);
      if (client) void this.completeExit(client);
      this.exitHoldStartedAtBySession.delete(sessionId);
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

  private async spawnTickTasks() {
    // Virus floor/cap logic (no economic gating)
    this.engine.ensureVirusMin();

    // Pellet spawning is gated by pelletReserveWei
    const currentFood = this.engine.foodNodeIds.length;
    const toSpawn = Math.min(FFA_CONFIG.foodSpawnAmount, FFA_CONFIG.foodMaxAmount - currentFood);

    for (let i = 0; i < toSpawn; i++) {
      const mass =
        FFA_CONFIG.foodMinMass +
        Math.floor(Math.random() * FFA_CONFIG.foodMaxMass);

      const costWei = massToPayoutAmount(mass, this.massPerEth);
      const ok = await trySpendPelletReserveWei(config.serverId, costWei);
      if (!ok) break;

      this.engine.spawnRandomFood(mass);
    }
  }

  private buildViewBox(sim: PlayerSim) {
    const len = sim.cellIds.length;
    if (len <= 0) return null;

    let totalSize = 1.0;
    let cx = 0;
    let cy = 0;

    for (const id of sim.cellIds) {
      const node = this.engine.nodes.get(id);
      if (!node || node.kind !== "player") continue;
      totalSize += massToRadius(node.mass);
      cx += node.x;
      cy += node.y;
    }

    cx = (cx / len) >> 0;
    cy = (cy / len) >> 0;

    const factor = Math.pow(Math.min(64.0 / totalSize, 1), 0.4);
    const sightRangeX = FFA_CONFIG.viewBaseX / factor;
    const sightRangeY = FFA_CONFIG.viewBaseY / factor;

    return {
      centerX: cx,
      centerY: cy,
      topY: cy - sightRangeY,
      bottomY: cy + sightRangeY,
      leftX: cx - sightRangeX,
      rightX: cx + sightRangeX,
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
    const nodes: Array<Record<string, unknown>> = [];

    for (const node of this.engine.nodes.values()) {
      if (node.y > box.bottomY) continue;
      if (node.y < box.topY) continue;
      if (node.x > box.rightX) continue;
      if (node.x < box.leftX) continue;

      nowVisible.add(node.id);
      nodes.push(this.nodeToDto(node));
    }

    const prev = this.prevVisibleIdsBySession.get(client.sessionId) ?? new Set<number>();
    const removedIds: number[] = [];
    for (const id of prev) {
      if (!nowVisible.has(id)) removedIds.push(id);
    }

    this.prevVisibleIdsBySession.set(client.sessionId, nowVisible);

    client.send("world:delta", {
      tick: this.tickCount,
      nodes,
      removedIds,
      ownedIds: [...sim.cellIds],
    });
  }

  private nodeToDto(node: WorldNode): Record<string, unknown> {
    const base: Record<string, unknown> = {
      id: node.id,
      kind: node.kind,
      x: node.x,
      y: node.y,
    };

    if (node.kind === "player") {
      const owner = this.engine.getPlayer(node.ownerSessionId);
      return {
        ...base,
        mass: node.mass,
        radius: massToRadius(node.mass),
        color: node.color,
        ownerSessionId: node.ownerSessionId,
        displayName: owner?.displayName,
      };
    }
    if (node.kind === "food") {
      return { ...base, mass: node.mass, radius: massToRadius(node.mass), color: node.color };
    }
    if (node.kind === "ejected") {
      return { ...base, mass: node.mass, radius: massToRadius(node.mass), color: node.color };
    }
    return { ...base, radius: massToRadius(node.sizeMass) };
  }

  private sendInit(client: Client) {
    client.send("world:init", {
      serverId: config.serverId,
      tickMs: FFA_CONFIG.tickMs,
      world: {
        left: FFA_CONFIG.borderLeft,
        right: FFA_CONFIG.borderRight,
        top: FFA_CONFIG.borderTop,
        bottom: FFA_CONFIG.borderBottom,
      },
      massPerEth: this.massPerEth,
      exitHoldMs: this.exitHoldMs,
    });
  }

  private async refreshBalancesAndMetadata() {
    try {
      this.cachedPelletReserveWei = await getPelletReserveWei(config.serverId);
      this.state.worldBalance = this.cachedPelletReserveWei.toString();
      this.refreshMetadata();
    } catch (error) {
      console.warn("[GameRoom] Failed to refresh balances:", error);
    }
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
