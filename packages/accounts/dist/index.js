import { DEFAULT_IDEMPOTENCY_TTL_SECONDS, DEFAULT_EXIT_RESERVATION_TTL_SECONDS, MAX_INT64, } from "./constants.js";
import { assertPositiveInt64, parseBalance, withOptimisticLock } from "./utils.js";
// ============================================================================
// AccountManager
// ============================================================================
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
export class AccountManager {
    redis;
    serverId;
    idempotencyTtl;
    exitReservationTtl;
    maxAmount;
    constructor(redis, serverId, options) {
        this.redis = redis;
        this.serverId = serverId;
        this.idempotencyTtl = options?.idempotencyTtlSeconds ?? DEFAULT_IDEMPOTENCY_TTL_SECONDS;
        this.exitReservationTtl = options?.exitReservationTtlSeconds ?? DEFAULT_EXIT_RESERVATION_TTL_SECONDS;
        this.maxAmount = options?.maxAbsAmountWei ?? MAX_INT64;
    }
    // --------------------------------------------------------------------------
    // Key Helpers
    // --------------------------------------------------------------------------
    keyAccount(name) {
        return `acc:${this.serverId}:${name}`;
    }
    keyIdemp(key) {
        return `idemp:${this.serverId}:${key}`;
    }
    keyExitRes(sessionId) {
        return `exitres:${this.serverId}:${sessionId}`;
    }
    keyExitResIndex() {
        return `exitres:${this.serverId}:__index__`;
    }
    // --------------------------------------------------------------------------
    // Idempotency Helpers
    // --------------------------------------------------------------------------
    async getCachedResult(idKey, expectedOp) {
        const raw = await this.redis.get(idKey);
        if (!raw)
            return null;
        const record = JSON.parse(raw);
        if (record.op !== expectedOp) {
            throw new Error(`Idempotency key reused for different operation: expected ${expectedOp}, got ${record.op}`);
        }
        return record;
    }
    async storeIdempResult(idKey, record) {
        const json = JSON.stringify(record);
        if (this.idempotencyTtl > 0) {
            await this.redis.setex(idKey, this.idempotencyTtl, json);
        }
        else {
            await this.redis.set(idKey, json);
        }
    }
    queueIdempResult(tx, idKey, record) {
        const json = JSON.stringify(record);
        if (this.idempotencyTtl > 0) {
            tx.setex(idKey, this.idempotencyTtl, json);
        }
        else {
            tx.set(idKey, json);
        }
    }
    // --------------------------------------------------------------------------
    // Public: Read Operations
    // --------------------------------------------------------------------------
    /**
     * Get the current balance of an account.
     */
    async getBalance(accountName) {
        const raw = await this.redis.get(this.keyAccount(accountName));
        return parseBalance(raw);
    }
    // --------------------------------------------------------------------------
    // Public: Deposit
    // --------------------------------------------------------------------------
    /**
     * Credit an account by `amountWei`. Returns the new balance.
     *
     * If `idempotencyKey` is provided, the operation is idempotent:
     * retries with the same key return the cached result.
     */
    async deposit(accountName, amountWei, idempotencyKey) {
        assertPositiveInt64(amountWei, this.maxAmount);
        if (amountWei === 0n)
            return this.getBalance(accountName);
        const balKey = this.keyAccount(accountName);
        // Fast path: no idempotency
        if (!idempotencyKey) {
            const next = await this.redis.incrby(balKey, amountWei.toString());
            return BigInt(next);
        }
        // Idempotent path
        const idKey = this.keyIdemp(idempotencyKey);
        return withOptimisticLock(this.redis, [balKey, idKey], async () => {
            const cached = await this.getCachedResult(idKey, "deposit");
            if (cached?.op === "deposit")
                return BigInt(cached.newBalanceWei);
            const tx = this.redis.multi();
            tx.incrby(balKey, amountWei.toString());
            const exec = await tx.exec();
            if (!exec)
                return null;
            const newBal = String(exec[0]?.[1] ?? "0");
            await this.storeIdempResult(idKey, { ok: true, op: "deposit", newBalanceWei: newBal });
            return BigInt(newBal);
        });
    }
    // --------------------------------------------------------------------------
    // Public: Withdraw
    // --------------------------------------------------------------------------
    /**
     * Debit an account by `amountWei`. Returns true if successful, false if
     * insufficient balance.
     *
     * If `idempotencyKey` is provided, the operation is idempotent.
     */
    async withdraw(accountName, amountWei, idempotencyKey) {
        assertPositiveInt64(amountWei, this.maxAmount);
        if (amountWei === 0n)
            return true;
        const balKey = this.keyAccount(accountName);
        // Fast path: no idempotency
        if (!idempotencyKey) {
            return withOptimisticLock(this.redis, [balKey], async () => {
                const current = parseBalance(await this.redis.get(balKey));
                if (current < amountWei)
                    return false;
                const tx = this.redis.multi();
                tx.decrby(balKey, amountWei.toString());
                const exec = await tx.exec();
                return exec ? true : null;
            });
        }
        // Idempotent path
        const idKey = this.keyIdemp(idempotencyKey);
        return withOptimisticLock(this.redis, [balKey, idKey], async () => {
            const cached = await this.getCachedResult(idKey, "withdraw");
            if (cached)
                return cached.ok;
            const current = parseBalance(await this.redis.get(balKey));
            const ok = current >= amountWei;
            const tx = this.redis.multi();
            if (ok)
                tx.decrby(balKey, amountWei.toString());
            this.queueIdempResult(tx, idKey, { ok, op: "withdraw" });
            const exec = await tx.exec();
            return exec ? ok : null;
        });
    }
    // --------------------------------------------------------------------------
    // Public: Transfer
    // --------------------------------------------------------------------------
    /**
     * Atomically move `amountWei` from one account to another.
     * Returns true if successful, false if source has insufficient balance.
     *
     * If `idempotencyKey` is provided, the operation is idempotent.
     */
    async transfer(fromAccountName, toAccountName, amountWei, idempotencyKey) {
        assertPositiveInt64(amountWei, this.maxAmount);
        if (amountWei === 0n)
            return true;
        const fromKey = this.keyAccount(fromAccountName);
        const toKey = this.keyAccount(toAccountName);
        // Fast path: no idempotency
        if (!idempotencyKey) {
            return withOptimisticLock(this.redis, [fromKey, toKey], async () => {
                const fromBal = parseBalance(await this.redis.get(fromKey));
                if (fromBal < amountWei)
                    return false;
                const tx = this.redis.multi();
                tx.decrby(fromKey, amountWei.toString());
                tx.incrby(toKey, amountWei.toString());
                const exec = await tx.exec();
                return exec ? true : null;
            });
        }
        // Idempotent path
        const idKey = this.keyIdemp(idempotencyKey);
        return withOptimisticLock(this.redis, [fromKey, toKey, idKey], async () => {
            const cached = await this.getCachedResult(idKey, "transfer");
            if (cached)
                return cached.ok;
            const fromBal = parseBalance(await this.redis.get(fromKey));
            const ok = fromBal >= amountWei;
            const tx = this.redis.multi();
            if (ok) {
                tx.decrby(fromKey, amountWei.toString());
                tx.incrby(toKey, amountWei.toString());
            }
            this.queueIdempResult(tx, idKey, { ok, op: "transfer" });
            const exec = await tx.exec();
            return exec ? ok : null;
        });
    }
    // --------------------------------------------------------------------------
    // Public: Exit Reservations
    // --------------------------------------------------------------------------
    /**
     * Reserve exit liquidity for a session. Moves `payoutWei` from
     * `server:bankroll` to `server:exit_reserved` and tracks it by sessionId.
     *
     * Returns true if reservation succeeded, false if insufficient bankroll.
     */
    async reserveExit(sessionId, payoutWei, idempotencyKey) {
        assertPositiveInt64(payoutWei, this.maxAmount);
        if (payoutWei === 0n)
            return true;
        const bankrollKey = this.keyAccount("server:bankroll");
        const reservedKey = this.keyAccount("server:exit_reserved");
        const resKey = this.keyExitRes(sessionId);
        const indexKey = this.keyExitResIndex();
        const expiresAt = Date.now() + this.exitReservationTtl * 1000;
        if (!idempotencyKey) {
            return withOptimisticLock(this.redis, [bankrollKey, reservedKey, resKey], async () => {
                const bankroll = parseBalance(await this.redis.get(bankrollKey));
                if (bankroll < payoutWei)
                    return false;
                const tx = this.redis.multi();
                tx.decrby(bankrollKey, payoutWei.toString());
                tx.incrby(reservedKey, payoutWei.toString());
                tx.set(resKey, payoutWei.toString());
                tx.zadd(indexKey, expiresAt, sessionId);
                const exec = await tx.exec();
                return exec ? true : null;
            });
        }
        const idKey = this.keyIdemp(idempotencyKey);
        return withOptimisticLock(this.redis, [bankrollKey, reservedKey, resKey, idKey], async () => {
            const cached = await this.getCachedResult(idKey, "reserveExit");
            if (cached)
                return cached.ok;
            const bankroll = parseBalance(await this.redis.get(bankrollKey));
            const ok = bankroll >= payoutWei;
            const tx = this.redis.multi();
            if (ok) {
                tx.decrby(bankrollKey, payoutWei.toString());
                tx.incrby(reservedKey, payoutWei.toString());
                tx.set(resKey, payoutWei.toString());
                tx.zadd(indexKey, expiresAt, sessionId);
            }
            this.queueIdempResult(tx, idKey, { ok, op: "reserveExit" });
            const exec = await tx.exec();
            return exec ? ok : null;
        });
    }
    /**
     * Release a previously reserved exit. Moves the reserved amount back to
     * `server:bankroll` and removes the reservation tracking.
     *
     * Returns true if released, false if no reservation found.
     */
    async releaseExit(sessionId, idempotencyKey) {
        const bankrollKey = this.keyAccount("server:bankroll");
        const reservedKey = this.keyAccount("server:exit_reserved");
        const resKey = this.keyExitRes(sessionId);
        const indexKey = this.keyExitResIndex();
        if (!idempotencyKey) {
            return withOptimisticLock(this.redis, [bankrollKey, reservedKey, resKey], async () => {
                const amountRaw = await this.redis.get(resKey);
                if (!amountRaw)
                    return false;
                const amount = BigInt(amountRaw);
                const tx = this.redis.multi();
                tx.incrby(bankrollKey, amount.toString());
                tx.decrby(reservedKey, amount.toString());
                tx.del(resKey);
                tx.zrem(indexKey, sessionId);
                const exec = await tx.exec();
                return exec ? true : null;
            });
        }
        const idKey = this.keyIdemp(idempotencyKey);
        return withOptimisticLock(this.redis, [bankrollKey, reservedKey, resKey, idKey], async () => {
            const cached = await this.getCachedResult(idKey, "releaseExit");
            if (cached)
                return cached.ok;
            const amountRaw = await this.redis.get(resKey);
            const ok = !!amountRaw;
            const amount = amountRaw ? BigInt(amountRaw) : 0n;
            const tx = this.redis.multi();
            if (ok) {
                tx.incrby(bankrollKey, amount.toString());
                tx.decrby(reservedKey, amount.toString());
                tx.del(resKey);
                tx.zrem(indexKey, sessionId);
            }
            this.queueIdempResult(tx, idKey, { ok, op: "releaseExit" });
            const exec = await tx.exec();
            return exec ? ok : null;
        });
    }
    /**
     * Sweep expired exit reservations, returning funds to bankroll.
     * Call periodically (e.g., every minute) to reclaim abandoned reservations.
     *
     * @param limit Max number of reservations to sweep per call (default 100).
     * @returns Number of reservations swept.
     */
    async sweepExpiredReservations(limit = 100) {
        const indexKey = this.keyExitResIndex();
        const now = Date.now();
        const expired = await this.redis.zrangebyscore(indexKey, 0, now, "LIMIT", 0, limit);
        if (expired.length === 0)
            return 0;
        let swept = 0;
        for (const sessionId of expired) {
            const released = await this.releaseExit(sessionId);
            if (released)
                swept++;
        }
        return swept;
    }
    /**
     * Get the reserved amount for a specific session, or null if not found.
     */
    async getExitReservation(sessionId) {
        const raw = await this.redis.get(this.keyExitRes(sessionId));
        return raw ? BigInt(raw) : null;
    }
    /**
     * Burn a reservation without returning to bankroll (for successful exits).
     * This removes the reservation tracking and debits `server:exit_reserved`.
     */
    async burnExitReservation(sessionId) {
        const reservedKey = this.keyAccount("server:exit_reserved");
        const resKey = this.keyExitRes(sessionId);
        const indexKey = this.keyExitResIndex();
        return withOptimisticLock(this.redis, [reservedKey, resKey], async () => {
            const amountRaw = await this.redis.get(resKey);
            if (!amountRaw)
                return false;
            const amount = BigInt(amountRaw);
            const tx = this.redis.multi();
            tx.decrby(reservedKey, amount.toString());
            tx.del(resKey);
            tx.zrem(indexKey, sessionId);
            const exec = await tx.exec();
            return exec ? true : null;
        });
    }
}
