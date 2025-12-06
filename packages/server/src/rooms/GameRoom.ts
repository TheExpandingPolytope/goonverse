import { Room, Client } from "colyseus";
import { GameState, Player, Blob, type InputMessage, type SpawnOptions } from "./schema/GameState.js";
import { verifyPrivyToken, getPrivyUser, getPrimaryWallet, type PrivyClaims } from "../auth/privy.js";
import { verifyDeposit, getServer } from "../services/ponder.js";
import {
  createExitTicket,
  generateSessionId,
  massToPayoutAmount,
  storeExitTicket,
  payoutAmountToMass,
} from "../services/exitController.js";
import { config } from "../config.js";
import type { PlayerUserData, AuthContext, ExitTicket, SerializedExitTicket } from "../types.js";

/**
 * Main game room
 * 
 * Handles:
 * - Privy JWT authentication in onAuth
 * - Deposit verification in onJoin
 * - Player spawning with placeholder physics
 * - Exit flow with hold-to-exit and ticket generation
 */
export class GameRoom extends Room<GameState> {
  private exitHoldMs: number = 3000;
  private massPerDollar: number = 100;
  private sessionNonce: number = 0;

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
    // Initialize state
    this.setState(new GameState());
    this.state.serverId = config.serverId;

    // Load server config from indexer
    const serverConfig = await getServer(config.serverId);
    if (serverConfig) {
      this.exitHoldMs = serverConfig.exitHoldMs;
      this.massPerDollar = serverConfig.massPerDollar;
      this.state.exitHoldMs = serverConfig.exitHoldMs;
      this.state.massPerDollar = serverConfig.massPerDollar;
    }

    // Register message handlers
    this.onMessage("input", (client, message: InputMessage) => {
      this.handleInput(client, message);
    });

    // Set up game loop (placeholder - no physics yet)
    this.setSimulationInterval((deltaTime) => {
      this.update(deltaTime);
    }, 1000 / this.state.tickRate);

    console.log(`GameRoom created for server ${config.serverId}`);
  }

  /**
   * Called when a client joins the room
   * 
   * Verifies the deposit and spawns the player.
   */
  async onJoin(client: Client, options: SpawnOptions, auth: AuthContext) {
    console.log(`Client ${client.sessionId} joining with options:`, options);

    // Validate required options
    if (!options.serverId || !options.depositId || !options.wallet) {
      throw new Error("Missing required spawn options: serverId, depositId, wallet");
    }

    // Verify server ID matches
    if (options.serverId.toLowerCase() !== config.serverId.toLowerCase()) {
      throw new Error(`Invalid serverId: expected ${config.serverId}, got ${options.serverId}`);
    }

    // Use wallet from auth if available, otherwise use provided wallet
    const wallet = auth.wallet || options.wallet;

    // Verify the deposit via Ponder
    const deposit = await verifyDeposit(
      options.serverId,
      options.depositId,
      wallet
    );

    if (!deposit) {
      throw new Error("Invalid or missing deposit");
    }

    // Calculate spawn mass from deposit
    const spawnMass = payoutAmountToMass(deposit.spawnAmount, this.massPerDollar);

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

    // Create blob with random spawn position
    const blob = new Blob();
    blob.id = client.sessionId;
    blob.owner = client.sessionId;
    blob.x = Math.random() * this.state.worldWidth;
    blob.y = Math.random() * this.state.worldHeight;
    blob.mass = spawnMass;
    blob.radius = this.massToRadius(spawnMass);

    player.blob = blob;
    this.state.players.set(client.sessionId, player);

    console.log(`Player ${client.sessionId} spawned with mass ${spawnMass}`);
  }

  /**
   * Called when a client leaves the room
   */
  async onLeave(client: Client, consented: boolean) {
    const player = this.state.players.get(client.sessionId);

    if (player) {
      // If player was in the middle of exiting, cancel it
      if (player.isExiting) {
        player.isExiting = false;
        player.exitStartedAt = 0;
        player.blob.isExiting = false;
        player.blob.exitProgress = 0;
      }

      // Remove player from state
      this.state.players.delete(client.sessionId);
    }

    console.log(`Client ${client.sessionId} left (consented: ${consented})`);
  }

  /**
   * Handle input messages from clients
   */
  private handleInput(client: Client, message: InputMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.isAlive) return;

    // Handle spacebar (exit trigger)
    if (message.spacebar) {
      if (!player.isExiting) {
        // Start exit hold
        this.startExit(client, player);
      }
    } else {
      if (player.isExiting) {
        // Cancel exit hold
        this.cancelExit(player);
      }
    }

    // Movement is placeholder for now - just update target position
    // Full physics will be implemented later
    if (!player.isExiting) {
      // Clamp to world bounds
      player.blob.x = Math.max(0, Math.min(this.state.worldWidth, message.x));
      player.blob.y = Math.max(0, Math.min(this.state.worldHeight, message.y));
    }
  }

  /**
   * Start the exit hold countdown
   */
  private startExit(client: Client, player: Player) {
    player.isExiting = true;
    player.exitStartedAt = Date.now();
    player.blob.isExiting = true;
    player.blob.exitProgress = 0;

    console.log(`Player ${client.sessionId} started exit hold`);
  }

  /**
   * Cancel the exit hold
   */
  private cancelExit(player: Player) {
    player.isExiting = false;
    player.exitStartedAt = 0;
    player.blob.isExiting = false;
    player.blob.exitProgress = 0;

    console.log(`Player ${player.sessionId} cancelled exit`);
  }

  /**
   * Complete the exit and generate ticket
   */
  private async completeExit(client: Client, player: Player) {
    const userData = client.userData as PlayerUserData;

    // Generate unique session ID for this exit
    const sessionId = generateSessionId(userData.wallet, ++this.sessionNonce);

    // Calculate payout from current mass
    const payout = massToPayoutAmount(player.currentMass, this.massPerDollar);

    // Create signed exit ticket
    const ticket = await createExitTicket(sessionId, userData.wallet, payout);

    // Store ticket in Redis via Presence
    await storeExitTicket(this.presence, ticket);

    // Mark player as dead
    player.isAlive = false;
    player.isExiting = false;
    player.blob.isExiting = false;

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
    // Update exit progress for players holding spacebar
    this.state.players.forEach((player, sessionId) => {
      if (player.isExiting && player.isAlive) {
        const elapsed = Date.now() - player.exitStartedAt;
        const progress = Math.min(1, elapsed / this.exitHoldMs);
        player.blob.exitProgress = progress;

        // Check if exit hold completed
        if (progress >= 1) {
          const client = this.clients.find((c) => c.sessionId === sessionId);
          if (client) {
            this.completeExit(client, player);
          }
        }
      }
    });

    // Placeholder: Full physics (movement, collision, eating) will be added later
  }

  /**
   * Convert mass to radius
   * r = c * sqrt(m)
   */
  private massToRadius(mass: number): number {
    const scalingConstant = 4;
    return scalingConstant * Math.sqrt(mass);
  }
}

