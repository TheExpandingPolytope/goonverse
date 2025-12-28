import type Redis from "ioredis";
import type { ExitTicket, SigningConfig } from "./types.js";
export type { ExitTicket, SerializedExitTicket, SigningConfig } from "./types.js";
export interface AccountManagerOptions {
    /**
     * TTL for idempotency entries. Defaults to 30 days.
     * Set to 0 to disable expiry (not recommended).
     */
    idempotencyTtlSeconds?: number;
    /**
     * Upper bound guard for Redis INCRBY/DECRBY (int64 max).
     */
    maxAbsAmountWei?: bigint;
}
/**
 * Redis-backed account ledger with server-scoped keys, idempotency, and
 * atomic balance operations. All amounts are in wei (bigint).
 *
 * Key structure:
 * - `acc:{serverId}:{accountName}` — balance (string integer)
 * - `idemp:{serverId}:{idempotencyKey}` — cached operation result
 *
 * Account naming convention:
 * - `user:pending:spawn:<wallet>` — deposit balance for spawning
 * - `user:pending:exit:<wallet>` — pending exit funds
 * - `server:world` — in-game world pool
 * - `server:total` — total bankroll (mirrors on-chain)
 * - `server:budget` — pellet spawning budget
 */
export declare class AccountManager {
    private readonly redis;
    private readonly idempotencyTtl;
    private readonly maxAmount;
    private readonly serverIdCache;
    constructor(redis: Redis, options?: AccountManagerOptions);
    /**
     * Convert a serverId to bytes32 format.
     * If already 66 chars (0x + 64 hex), return as-is.
     * Otherwise, right-pad with zeros. Results are cached.
     */
    private toBytes32;
    private keyAccount;
    private keyIdemp;
    /**
     * Check if an idempotency key already has a cached result.
     * Returns the cached result or null if not found.
     */
    private getCachedResult;
    /**
     * Store an idempotency result with TTL.
     */
    private storeIdempResult;
    /**
     * Queue idempotency result storage within a MULTI transaction.
     */
    private queueIdempResult;
    /**
     * Create and sign an exit ticket.
     */
    private signExitTicket;
    /**
     * Serialize an ExitTicket for JSON storage/transport.
     */
    private serializeTicket;
    /**
     * Deserialize a SerializedExitTicket back to ExitTicket.
     */
    private deserializeTicket;
    /**
     * Get the current balance of an account.
     */
    getBalance(serverId: string, accountName: string): Promise<bigint>;
    /**
     * Credit an account by `amountWei`. Returns the new balance.
     *
     * If `idempotencyKey` is provided, the operation is idempotent:
     * retries with the same key return the cached result.
     */
    deposit(serverId: string, accountName: string, amountWei: bigint, idempotencyKey?: string): Promise<bigint>;
    /**
     * Debit an account by `amountWei` without crediting anywhere (destroy funds).
     * Returns true if successful, false if insufficient balance.
     *
     * If `idempotencyKey` is provided, the operation is idempotent.
     */
    burn(serverId: string, accountName: string, amountWei: bigint, idempotencyKey?: string): Promise<boolean>;
    /**
     * Atomically move `amountWei` from one account to another.
     * Returns true if successful, false if source has insufficient balance.
     *
     * If `idempotencyKey` is provided, the operation is idempotent.
     */
    transfer(serverId: string, fromAccountName: string, toAccountName: string, amountWei: bigint, idempotencyKey?: string): Promise<boolean>;
    /**
     * Withdraw funds from server:world to user:pending:exit and create a signed exit ticket.
     *
     * This is the main exit function:
     * 1. Transfers `amountWei` from `server:world` to `user:pending:exit:<wallet>`
     * 2. Signs and returns an ExitTicket
     *
     * Returns the ExitTicket if successful, null if insufficient balance in server:world.
     *
     * @param serverId - Server identifier (will be normalized to bytes32)
     * @param wallet - Player's wallet address (will be lowercased)
     * @param amountWei - Payout amount in wei
     * @param sessionId - Unique session ID for the exit ticket
     * @param signingConfig - Controller key and world address for signing
     * @param idempotencyKey - Optional idempotency key for retry safety
     */
    withdraw(serverId: string, wallet: `0x${string}`, amountWei: bigint, sessionId: `0x${string}`, signingConfig: SigningConfig, idempotencyKey?: string): Promise<ExitTicket | null>;
}
