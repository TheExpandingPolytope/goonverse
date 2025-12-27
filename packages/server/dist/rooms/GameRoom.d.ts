import { Room, Client } from "colyseus";
import { GameState, type SpawnOptions } from "./schema/GameState.js";
import type { AuthContext } from "../types.js";
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
export declare class GameRoom extends Room<GameState> {
    private exitHoldMs;
    private massPerEth;
    private sessionNonce;
    private buyInAmount;
    private rakeShareBps;
    private worldShareBps;
    private startedAt;
    private readonly engine;
    private tickCount;
    private spawnTickCount;
    private spawnTaskInFlight;
    private readonly prevVisibleIdsBySession;
    private readonly prevKeyStateBySession;
    private readonly exitHoldStartedAtBySession;
    private cachedPelletReserveWei;
    private spawnCostWei;
    private sanitizeDisplayName;
    private deriveFallbackDisplayName;
    /**
     * Authenticate the client before allowing them to join
     *
     * Verifies the Privy JWT access token and extracts user claims.
     * Rejects immediately if token is invalid/expired.
     */
    static onAuth(token: string, _request: unknown): Promise<AuthContext>;
    /**
     * Called when the room is created
     */
    onCreate(_options: Record<string, unknown>): Promise<void>;
    /**
     * Called when a client joins the room
     *
     * Handles two flows:
     * 1. Reconnect: If wallet already has a living entity, reattach to it
     * 2. Spawn: Verify deposit is unused, mark as used, then spawn
     */
    onJoin(client: Client, options: SpawnOptions & {
        reconnect?: boolean;
    }, auth: AuthContext): Promise<void>;
    /**
     * Find a player by wallet address
     */
    private getPlayerByWallet;
    /**
     * Check if this room currently has a living entity for the given wallet.
     *
     * This is exposed for remoteRoomCall from HTTP handlers (e.g., /join-eligibility)
     * so we can support reconnects without requiring a new deposit.
     */
    hasActiveEntity(wallet: string): boolean;
    /**
     * Called when a client leaves the room
     *
     * If consented (player intentionally left), remove immediately.
     * If not consented (disconnect), keep entity alive for reconnect window.
     */
    onLeave(client: Client, consented: boolean): Promise<void>;
    /**
     * Remove a player and their blobs from the game
     */
    private removePlayer;
    /**
     * Called when the room is disposed
     */
    onDispose(): Promise<void>;
    /**
     * Handle input messages from clients
     */
    private handleInput;
    /**
     * Start the exit hold countdown
     */
    private startExit;
    /**
     * Cancel the exit hold
     */
    private cancelExit;
    /**
     * Complete the exit and generate ticket
     */
    private completeExit;
    /**
     * Game loop update (fixed 50ms ticks).
     *
     * - Runs authoritative simulation
     * - Applies economic recycling to pelletReserveWei
     * - Sends per-client visibility deltas
     */
    private update;
    private spawnTickTasks;
    private buildViewBox;
    private sendVisibilityDelta;
    private nodeToDto;
    private sendInit;
    private refreshBalancesAndMetadata;
    private refreshMetadata;
}
