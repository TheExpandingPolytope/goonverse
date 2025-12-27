import type Redis from "ioredis";
export type { IdempotentRecord, OpType } from "./types.js";
export interface AccountManagerOptions {
    /**
     * TTL for idempotency entries. Defaults to 30 days.
     * Set to 0 to disable expiry (not recommended).
     */
    idempotencyTtlSeconds?: number;
    /**
     * TTL for exit reservations. Defaults to 24 hours.
     */
    exitReservationTtlSeconds?: number;
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
 * - `exitres:{serverId}:{sessionId}` — exit reservation amount
 * - `exitres:{serverId}:__index__` — sorted set of reservation expirations
 */
export declare class AccountManager {
    private readonly redis;
    private readonly serverId;
    private readonly idempotencyTtl;
    private readonly exitReservationTtl;
    private readonly maxAmount;
    constructor(redis: Redis, serverId: string, options?: AccountManagerOptions);
    private keyAccount;
    private keyIdemp;
    private keyExitRes;
    private keyExitResIndex;
    private getCachedResult;
    private storeIdempResult;
    private queueIdempResult;
    /**
     * Get the current balance of an account.
     */
    getBalance(accountName: string): Promise<bigint>;
    /**
     * Credit an account by `amountWei`. Returns the new balance.
     *
     * If `idempotencyKey` is provided, the operation is idempotent:
     * retries with the same key return the cached result.
     */
    deposit(accountName: string, amountWei: bigint, idempotencyKey?: string): Promise<bigint>;
    /**
     * Debit an account by `amountWei`. Returns true if successful, false if
     * insufficient balance.
     *
     * If `idempotencyKey` is provided, the operation is idempotent.
     */
    withdraw(accountName: string, amountWei: bigint, idempotencyKey?: string): Promise<boolean>;
    /**
     * Atomically move `amountWei` from one account to another.
     * Returns true if successful, false if source has insufficient balance.
     *
     * If `idempotencyKey` is provided, the operation is idempotent.
     */
    transfer(fromAccountName: string, toAccountName: string, amountWei: bigint, idempotencyKey?: string): Promise<boolean>;
    /**
     * Reserve exit liquidity for a session. Moves `payoutWei` from
     * `server:bankroll` to `server:exit_reserved` and tracks it by sessionId.
     *
     * Returns true if reservation succeeded, false if insufficient bankroll.
     */
    reserveExit(sessionId: string, payoutWei: bigint, idempotencyKey?: string): Promise<boolean>;
    /**
     * Release a previously reserved exit. Moves the reserved amount back to
     * `server:bankroll` and removes the reservation tracking.
     *
     * Returns true if released, false if no reservation found.
     */
    releaseExit(sessionId: string, idempotencyKey?: string): Promise<boolean>;
    /**
     * Sweep expired exit reservations, returning funds to bankroll.
     * Call periodically (e.g., every minute) to reclaim abandoned reservations.
     *
     * @param limit Max number of reservations to sweep per call (default 100).
     * @returns Number of reservations swept.
     */
    sweepExpiredReservations(limit?: number): Promise<number>;
    /**
     * Get the reserved amount for a specific session, or null if not found.
     */
    getExitReservation(sessionId: string): Promise<bigint | null>;
    /**
     * Burn a reservation without returning to bankroll (for successful exits).
     * This removes the reservation tracking and debits `server:exit_reserved`.
     */
    burnExitReservation(sessionId: string): Promise<boolean>;
}
