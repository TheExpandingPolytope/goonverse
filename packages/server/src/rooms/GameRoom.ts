import { Room, Client } from "colyseus";
import { 
  GameState, 
  Player, 
  Blob, 
  Pellet, 
  EjectedMass,
  type InputMessage, 
  type SpawnOptions 
} from "./schema/GameState.js";
import { verifyPrivyToken, getPrivyUser, getPrimaryWallet, type PrivyClaims } from "../auth/privy.js";
import { verifyDeposit, getServer, type Deposit } from "../services/ponder.js";
import {
  createExitTicket,
  generateSessionId,
  massToPayoutAmount,
  storeExitTicket,
  payoutAmountToMass,
} from "../services/exitController.js";
import { tryUseDeposit } from "../services/depositTracker.js";
import { config } from "../config.js";
import { GAME_CONFIG, massToRadius } from "../gameConfig.js";
import type { PlayerUserData, AuthContext, SerializedExitTicket } from "../types.js";

// Game Systems
import { SpatialGrid, type SpatialEntity } from "./systems/SpatialGrid.js";
import { 
  updateBlobMovement, 
  updateEjectedMassMovement, 
  updateSplitTimer,
  startExitHold,
  cancelExitHold,
  updateExitProgress,
  applySoftCollision,
  applyAttraction
} from "./systems/PhysicsSystem.js";
import { processEating, updatePlayerMass } from "./systems/EatingSystem.js";
import { trySplitAll, processMerging } from "./systems/SplitMergeSystem.js";
import { tryEjectAll } from "./systems/EjectSystem.js";
import { spawnPellets } from "./systems/PelletSystem.js";
import { BalanceSystem } from "./systems/BalanceSystem.js";

/**
 * Blob wrapper for spatial grid
 */
interface BlobEntity extends SpatialEntity {
  blob: Blob;
  player: Player;
}

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
  private exitHoldMs: number = GAME_CONFIG.EXIT_HOLD_MS;
  private massPerEth: number = 100;
  private sessionNonce: number = 0;
  private buyInAmount: string = "0";
  private readonly creditedDeposits: Set<string> = new Set();
  private startedAt: number = Date.now();

  // Balance System
  private balanceSystem!: BalanceSystem;

  // Spatial grids for efficient collision detection
  private blobGrid!: SpatialGrid<BlobEntity>;
  private pelletGrid!: SpatialGrid<Pellet>;
  private ejectedMassGrid!: SpatialGrid<EjectedMass>;

  // Player color counter
  private colorCounter: number = 0;

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
    this.state.tickRate = GAME_CONFIG.TICK_RATE;
    this.state.worldWidth = GAME_CONFIG.WORLD_WIDTH;
    this.state.worldHeight = GAME_CONFIG.WORLD_HEIGHT;

    // Initialize balance tracking early so metadata always has a value
    this.balanceSystem = new BalanceSystem(config.serverId, this.massPerEth);
    this.balanceSystem.initialize(this.state, 0n);

    // Initialize spatial grids
    this.blobGrid = new SpatialGrid<BlobEntity>(
      GAME_CONFIG.WORLD_WIDTH,
      GAME_CONFIG.WORLD_HEIGHT,
      GAME_CONFIG.GRID_CELL_SIZE
    );
    this.pelletGrid = new SpatialGrid<Pellet>(
      GAME_CONFIG.WORLD_WIDTH,
      GAME_CONFIG.WORLD_HEIGHT,
      GAME_CONFIG.GRID_CELL_SIZE
    );
    this.ejectedMassGrid = new SpatialGrid<EjectedMass>(
      GAME_CONFIG.WORLD_WIDTH,
      GAME_CONFIG.WORLD_HEIGHT,
      GAME_CONFIG.GRID_CELL_SIZE
    );

    // Load server config from indexer
    const serverConfig = await getServer(config.serverId);
    if (serverConfig) {
      this.exitHoldMs = serverConfig.exitHoldMs;
      this.massPerEth = serverConfig.massPerEth;
      this.balanceSystem.setMassPerEth(serverConfig.massPerEth);
      this.buyInAmount = serverConfig.buyInAmount;
      this.state.exitHoldMs = serverConfig.exitHoldMs;
      this.state.massPerEth = serverConfig.massPerEth;
      // Ponder schema may omit worldBalance; default to zero
      const initialBalance = (serverConfig as any).worldBalance ? BigInt((serverConfig as any).worldBalance) : 0n;
      this.balanceSystem.initialize(this.state, initialBalance);
    }

    this.refreshMetadata();

    // TODO: Persist world balance on dispose
    // We should probably save the balance back to Ponder or Redis periodically or on dispose
    // For now, it's just in-memory state


    // Register message handlers
    this.onMessage("input", (client, message: InputMessage) => {
      this.handleInput(client, message);
    });

    // Log initial state (useful to verify no pellets are pre-spawned)
    console.log(
      `GameRoom created for server ${config.serverId} with ` +
        `${this.state.players.size} players and ${this.state.pellets.size} pellets`,
    );

    // Set up game loop
    this.setSimulationInterval((deltaTime) => {
      this.update(deltaTime);
    }, 1000 / GAME_CONFIG.TICK_RATE);

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

    // Use wallet from auth if available, otherwise use provided wallet
    const wallet = (auth.wallet || options.wallet)?.toLowerCase() as `0x${string}`;

    if (!wallet) {
      throw new Error("No wallet provided");
    }

    // RECONNECT FLOW: Check if this wallet already has a living entity
    const existingPlayer = this.getPlayerByWallet(wallet);
    if (existingPlayer && existingPlayer.isAlive) {
      const oldSessionId = existingPlayer.sessionId;
      console.log(`Reconnecting wallet ${wallet} from ${oldSessionId} to ${client.sessionId}`);
      
      // Update player's sessionId to match new client
      existingPlayer.sessionId = client.sessionId;
      
      // Update blob owners to match new sessionId
      for (const blob of existingPlayer.blobs) {
        blob.owner = client.sessionId;
      }
      
      // Re-key player in the map (required for lookups like state.players.get(client.sessionId))
      this.state.players.delete(oldSessionId);
      this.state.players.set(client.sessionId, existingPlayer);
      
      // Clear disconnect flag
      (existingPlayer as any).isDisconnected = false;
      (existingPlayer as any).disconnectedAt = 0;
      
      // Restore client userData
      client.userData = {
        wallet,
        depositId: (existingPlayer as any).depositId || options.depositId,
        spawnMass: BigInt(Math.floor(existingPlayer.spawnMass)),
        privyClaims: auth.privyClaims,
      } as PlayerUserData;
      
      console.log(`Player ${client.sessionId} reconnected with mass ${existingPlayer.currentMass}`);
      return;
    }

    // SPAWN FLOW: Need a valid, unused deposit

    // Validate required options for spawn
    if (!options.serverId || !options.depositId) {
      throw new Error("Missing required spawn options: serverId, depositId");
    }

    // Verify server ID matches
    if (options.serverId.toLowerCase() !== config.serverId.toLowerCase()) {
      throw new Error(`Invalid serverId: expected ${config.serverId}, got ${options.serverId}`);
    }

    // Verify the deposit via Ponder
    const deposit = await verifyDeposit(
      options.serverId,
      options.depositId,
      wallet
    );

    if (!deposit) {
      throw new Error("Invalid or missing deposit");
    }

    // ATOMIC: Try to mark deposit as used
    // This prevents race conditions where two clients try to use the same deposit
    const wasUnused = await tryUseDeposit(options.serverId, options.depositId);
    if (!wasUnused) {
      throw new Error("Deposit has already been used");
    }

    // Double-check: entity might have been created while we were verifying deposit
    // (handles race condition - two tabs, or reconnect timeout edge case)
    const entityCreatedDuringVerify = this.getPlayerByWallet(wallet);
    if (entityCreatedDuringVerify && entityCreatedDuringVerify.isAlive) {
      // Another connection beat us - reconnect to existing entity
      // Note: The deposit we just marked is "wasted" but that's the cost of the race condition
      console.log(`[GameRoom] Race condition: entity exists for ${wallet}, reconnecting (deposit ${options.depositId} wasted)`);
      
      const oldSessionId = entityCreatedDuringVerify.sessionId;
      entityCreatedDuringVerify.sessionId = client.sessionId;
      for (const blob of entityCreatedDuringVerify.blobs) {
        blob.owner = client.sessionId;
      }
      this.state.players.delete(oldSessionId);
      this.state.players.set(client.sessionId, entityCreatedDuringVerify);
      (entityCreatedDuringVerify as any).isDisconnected = false;
      (entityCreatedDuringVerify as any).disconnectedAt = 0;
      client.userData = {
        wallet,
        depositId: (entityCreatedDuringVerify as any).depositId || options.depositId,
        spawnMass: BigInt(Math.floor(entityCreatedDuringVerify.spawnMass)),
        privyClaims: auth.privyClaims,
      } as PlayerUserData;
      return;
    }

    // Update world balance with this deposit's world share iff it occurred after this room booted
    this.creditWorldShare(deposit);

    // Calculate spawn mass from deposit
    const spawnMass = payoutAmountToMass(deposit.spawnAmount, this.massPerEth);

    // Store player data on client.userData
    const userData: PlayerUserData = {
      wallet,
      depositId: options.depositId,
      spawnMass: deposit.spawnAmount,
      privyClaims: auth.privyClaims,
    };
    client.userData = userData;

    // Create player in state
    const player = new Player();
    player.sessionId = client.sessionId;
    player.wallet = wallet;
    player.spawnMass = spawnMass;
    player.currentMass = spawnMass;
    player.isAlive = true;
    player.isExiting = false;
    player.color = this.colorCounter++ % 16;
    
    // Store depositId on player for reconnect recovery
    (player as any).depositId = options.depositId;

    // Create initial blob
    const blob = new Blob();
    blob.id = `${client.sessionId}_blob_0`;
    blob.owner = client.sessionId;
    blob.x = Math.random() * (GAME_CONFIG.WORLD_WIDTH - 200) + 100;
    blob.y = Math.random() * (GAME_CONFIG.WORLD_HEIGHT - 200) + 100;
    blob.targetX = blob.x;
    blob.targetY = blob.y;
    blob.mass = spawnMass;
    blob.radius = massToRadius(spawnMass);
    blob.vx = 0;
    blob.vy = 0;
    blob.timeSinceSplit = GAME_CONFIG.RECOMBINE_TIME_MS; // Can merge immediately if somehow split
    blob.canMerge = true;

    player.blobs.push(blob);
    this.state.players.set(client.sessionId, player);

    // Add blob to spatial grid
    this.blobGrid.insert({
      id: blob.id,
      x: blob.x,
      y: blob.y,
      radius: blob.radius,
      blob,
      player,
    });

    console.log(`Player ${client.sessionId} spawned with mass ${spawnMass}`);
  }

  /**
   * Find a player by wallet address
   */
  private getPlayerByWallet(wallet: string): Player | null {
    const normalizedWallet = wallet.toLowerCase();
    for (const player of this.state.players.values()) {
      if (player.wallet.toLowerCase() === normalizedWallet) {
        return player;
      }
    }
    return null;
  }

  /**
   * Check if this room currently has a living entity for the given wallet.
   * 
   * This is exposed for remoteRoomCall from HTTP handlers (e.g., /join-eligibility)
   * so we can support reconnects without requiring a new deposit.
   */
  public hasActiveEntity(wallet: string): boolean {
    const player = this.getPlayerByWallet(wallet);
    const hasEntity = !!player && player.isAlive;

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
    const player = this.state.players.get(client.sessionId);

    if (!player) {
      console.log(`Client ${client.sessionId} left but no player found`);
      return;
    }

    if (consented) {
      // Player intentionally left - remove immediately
      this.removePlayer(client.sessionId);
      console.log(`Client ${client.sessionId} left intentionally, removed`);
    } else {
      // Disconnect - keep entity alive for reconnect window
      // Mark as disconnected so they can reconnect
      (player as any).isDisconnected = true;
      (player as any).disconnectedAt = Date.now();
      console.log(`Client ${client.sessionId} disconnected, entity kept alive for reconnect`);
    }
  }

  /**
   * Remove a player and their blobs from the game
   */
  private removePlayer(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;

      // Remove blobs from spatial grid
      for (const blob of player.blobs) {
        this.blobGrid.remove({
          id: blob.id,
          x: blob.x,
          y: blob.y,
          radius: blob.radius,
          blob,
          player,
        });
      }

      // Remove player from state
    this.state.players.delete(sessionId);
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
    const player = this.state.players.get(client.sessionId);
    console.log("handleInput", message);
    if (!player || !player.isAlive) return;

    // Interpret x/y as a screen-space direction vector (from center of screen).
    // Normalize to unit length and project from the player's center into world
    // space to derive a far-away target point for movement/split/eject.
    let dirX = message.x;
    let dirY = message.y;
    const mag = Math.hypot(dirX, dirY);
    if (mag > 0) {
      dirX /= mag;
      dirY /= mag;
    } else {
      dirX = 0;
      dirY = 0;
    }

    let centerX = 0;
    let centerY = 0;
    let totalMass = 0;
    for (const blob of player.blobs) {
      totalMass += Number(blob.mass);
      centerX += blob.x * Number(blob.mass);
      centerY += blob.y * Number(blob.mass);
    }
    if (totalMass > 0) {
      centerX /= totalMass;
      centerY /= totalMass;
    } else if (player.blobs.length > 0) {
      const first = player.blobs[0]!;
      centerX = first.x;
      centerY = first.y;
    }

    const maxRadius = Math.min(GAME_CONFIG.WORLD_WIDTH, GAME_CONFIG.WORLD_HEIGHT) * 0.45;
    const targetX = Math.max(0, Math.min(GAME_CONFIG.WORLD_WIDTH, centerX + dirX * maxRadius));
    const targetY = Math.max(0, Math.min(GAME_CONFIG.WORLD_HEIGHT, centerY + dirY * maxRadius));

    // Update target position for all blobs so movement uses this direction
    for (const blob of player.blobs) {
      blob.targetX = targetX;
      blob.targetY = targetY;
    }

    // Handle Q key (exit trigger)
    if (message.q) {
      if (!player.isExiting) {
        this.startExit(client, player);
      }
    } else {
      if (player.isExiting) {
        this.cancelExit(player);
      }
    }

    // Handle Space key (split) - only if not exiting
    if (message.space && !player.isExiting) {
      trySplitAll(player, targetX, targetY);
      updatePlayerMass(player);
    }

    // Handle W key (eject mass) - only if not exiting
    if (message.w && !player.isExiting) {
      const ejected = tryEjectAll(this.state, [...player.blobs], targetX, targetY);
      for (const e of ejected) {
        this.ejectedMassGrid.insert(e);
      }
      updatePlayerMass(player);
    }
  }

  /**
   * Start the exit hold countdown
   */
  private startExit(client: Client, player: Player) {
    player.isExiting = true;
    player.exitStartedAt = Date.now();

    // Start exit for all blobs
    for (const blob of player.blobs) {
      startExitHold(blob);
    }

    console.log(`Player ${client.sessionId} started exit hold`);
  }

  /**
   * Cancel the exit hold
   */
  private cancelExit(player: Player) {
    player.isExiting = false;
    player.exitStartedAt = 0;

    // Cancel exit for all blobs
    for (const blob of player.blobs) {
      cancelExitHold(blob);
    }

    console.log(`Player ${player.sessionId} cancelled exit`);
  }

  /**
   * Complete the exit and generate ticket
   */
  private async completeExit(client: Client, player: Player) {
    const userData = client.userData as PlayerUserData;

    // Generate unique session ID for this exit
    const sessionId = generateSessionId(userData.wallet, ++this.sessionNonce);

    // Calculate payout from current mass (all blobs combined)
    const payout = massToPayoutAmount(player.currentMass, this.massPerEth);
    if (!this.balanceSystem.hasSufficientBalance(this.state, payout)) {
      console.error(
        `[GameRoom] Insufficient world balance for payout of ${payout.toString()} on server ${config.serverId}`
      );
      this.cancelExit(player);
      const failClient = this.clients.find((c) => c.sessionId === client.sessionId);
      if (failClient) {
        failClient.send("exitError", { message: "Server temporarily out of funds, please try again." });
      }
      return;
    }
    this.balanceSystem.debit(this.state, payout);
    this.refreshMetadata();

    // Create signed exit ticket
    const ticket = await createExitTicket(sessionId, userData.wallet, payout);

    // Store ticket in Redis via Presence
    await storeExitTicket(this.presence, ticket);

    // Mark player as dead
    player.isAlive = false;
    player.isExiting = false;

    // Remove blobs from spatial grid
    for (const blob of player.blobs) {
      blob.isExiting = false;
      this.blobGrid.remove({
        id: blob.id,
        x: blob.x,
        y: blob.y,
        radius: blob.radius,
        blob,
        player,
      });
    }

    // Send ticket to client
    const serializedTicket: SerializedExitTicket = {
      serverId: ticket.serverId,
      sessionId: ticket.sessionId,
      player: ticket.player,
      payout: ticket.payout.toString(),
      deadline: ticket.deadline.toString(),
      signature: ticket.signature,
    };

    client.send("exitTicket", serializedTicket);

    console.log(`Player ${client.sessionId} exited with payout ${payout}`);

    // Remove player from state after a short delay
    setTimeout(() => {
      this.state.players.delete(client.sessionId);
    }, 1000);
  }

  /**
   * Game loop update
   */
  private update(deltaTime: number) {
    const deltaTimeSeconds = deltaTime / 1000;
    const deltaTimeMs = deltaTime;

    // 1. Update physics for all blobs
    this.state.players.forEach((player) => {
      if (!player.isAlive) return;

      for (const blob of player.blobs) {
        // Update split timer
        updateSplitTimer(blob, deltaTimeMs);

        // Update movement
        updateBlobMovement(blob, deltaTimeSeconds);

        // Update blob in spatial grid
        this.blobGrid.update({
          id: blob.id,
          x: blob.x,
          y: blob.y,
          radius: blob.radius,
          blob,
          player,
        });
      }
    });

    // 2. Update physics for ejected mass
    this.state.ejectedMass.forEach((ejected) => {
      updateEjectedMassMovement(ejected, deltaTimeSeconds);
      this.ejectedMassGrid.update(ejected);
    });

    // 3. Apply attraction between same-player blobs
    this.state.players.forEach((player) => {
      if (!player.isAlive) return;
      applyAttraction(player, deltaTimeSeconds);
    });

    // 4. Apply soft collision between same-player blobs
    this.state.players.forEach((player) => {
      if (!player.isAlive) return;
      applySoftCollision(player);
    });

    // 5. Process merging
    this.state.players.forEach((player) => {
      if (!player.isAlive) return;
      processMerging(player);
    });

    // 6. Process eating (player-player, player-pellet, player-ejected)
    const killedPlayers = processEating(
      this.state,
      this.blobGrid,
      this.pelletGrid,
      this.ejectedMassGrid
    );

    // Handle killed players
    for (const sessionId of killedPlayers) {
      const client = this.clients.find((c) => c.sessionId === sessionId);
      if (client) {
        client.send("death", { message: "You were eaten!" });
      }
    }

    // 7. Update exit progress for exiting players
    this.state.players.forEach((player, sessionId) => {
      if (!player.isExiting || !player.isAlive) return;

      let allBlobsComplete = true;
      for (const blob of player.blobs) {
        const complete = updateExitProgress(blob, player.exitStartedAt, this.exitHoldMs);
        if (!complete) allBlobsComplete = false;
      }

      // Check if exit hold completed
      if (allBlobsComplete) {
        const client = this.clients.find((c) => c.sessionId === sessionId);
        if (client) {
          this.completeExit(client, player);
        }
      }
    });

    // 8. Spawn pellets
    const newPellets = spawnPellets(this.state, deltaTimeSeconds, this.balanceSystem);
    for (const pellet of newPellets) {
      this.pelletGrid.insert(pellet);
    }
    if (newPellets.length > 0) {
      this.refreshMetadata();
    }

    // 9. Update player masses
    this.state.players.forEach((player) => {
      if (!player.isAlive) return;
      updatePlayerMass(player);
    });

    // 10. Reconnect timeout handling disabled:
    // If a player's blob persists in the world, they should always be able
    // to reconnect later and regain control.
  }

  /**
   * Check for disconnected players that have exceeded the reconnect timeout
   */
  private checkReconnectTimeouts() {
    // Intentionally disabled.
    // We keep disconnected entities indefinitely (they can still be eaten),
    // and allow the owning wallet to reconnect at any time if the entity
    // remains alive.
  }

  private creditWorldShare(deposit: Deposit) {
    if (this.creditedDeposits.has(deposit.id)) {
      return;
    }
    const depositTimestampMs = Number(deposit.timestamp ?? 0n) * 1000;
    if (depositTimestampMs < this.startedAt) {
      this.creditedDeposits.add(deposit.id);
      return;
    }
    this.balanceSystem.credit(this.state, deposit.worldAmount ?? 0n);
    this.creditedDeposits.add(deposit.id);
    this.refreshMetadata();
  }

  private refreshMetadata() {
    this.setMetadata({
      serverId: config.serverId,
      buyInAmount: this.buyInAmount,
      massPerEth: this.massPerEth,
      region: config.region,
      worldContract: config.worldContractAddress,
      worldBalance: this.balanceSystem.getBalance(this.state).toString(),
    });
  }
}
