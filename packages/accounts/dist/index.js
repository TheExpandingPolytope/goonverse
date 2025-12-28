import { keccak256, encodePacked } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEFAULT_IDEMPOTENCY_TTL_SECONDS, DEFAULT_EXIT_TICKET_TTL_SECONDS, MAX_INT64 } from "./constants.js";
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
 *
 * Account naming convention:
 * - `user:pending:spawn:<wallet>` — deposit balance for spawning
 * - `user:pending:exit:<wallet>` — pending exit funds
 * - `server:world` — in-game world pool
 * - `server:total` — total bankroll (mirrors on-chain)
 * - `server:budget` — pellet spawning budget
 */
export class AccountManager {
    redis;
    idempotencyTtl;
    maxAmount;
    serverIdCache = new Map();
    constructor(redis, options) {
        this.redis = redis;
        this.idempotencyTtl = options?.idempotencyTtlSeconds ?? DEFAULT_IDEMPOTENCY_TTL_SECONDS;
        this.maxAmount = options?.maxAbsAmountWei ?? MAX_INT64;
    }
    // --------------------------------------------------------------------------
    // Key Helpers
    // --------------------------------------------------------------------------
    /**
     * Convert a serverId to bytes32 format.
     * If already 66 chars (0x + 64 hex), return as-is.
     * Otherwise, right-pad with zeros. Results are cached.
     */
    toBytes32(serverId) {
        const cached = this.serverIdCache.get(serverId);
        if (cached)
            return cached;
        let result;
        if (serverId.startsWith("0x") && serverId.length === 66) {
            result = serverId.toLowerCase();
        }
        else {
            const hex = Buffer.from(serverId, "utf8").toString("hex");
            result = `0x${hex.padEnd(64, "0")}`;
        }
        this.serverIdCache.set(serverId, result);
        return result;
    }
    keyAccount(serverId, name) {
        return `acc:${this.toBytes32(serverId)}:${name}`;
    }
    keyIdemp(serverId, key) {
        return `idemp:${this.toBytes32(serverId)}:${key}`;
    }
    // --------------------------------------------------------------------------
    // Idempotency Helpers
    // --------------------------------------------------------------------------
    /**
     * Check if an idempotency key already has a cached result.
     * Returns the cached result or null if not found.
     */
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
    /**
     * Store an idempotency result with TTL.
     */
    async storeIdempResult(idKey, record) {
        const json = JSON.stringify(record);
        if (this.idempotencyTtl > 0) {
            await this.redis.setex(idKey, this.idempotencyTtl, json);
        }
        else {
            await this.redis.set(idKey, json);
        }
    }
    /**
     * Queue idempotency result storage within a MULTI transaction.
     */
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
    // Signing Helpers
    // --------------------------------------------------------------------------
    /**
     * Create and sign an exit ticket.
     */
    async signExitTicket(serverIdBytes32, sessionId, player, payout, signingConfig) {
        const account = privateKeyToAccount(signingConfig.controllerPrivateKey);
        const ttl = signingConfig.exitTicketTtlSeconds ?? DEFAULT_EXIT_TICKET_TTL_SECONDS;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + ttl);
        // Create the message hash matching World.sol's abi.encodePacked format
        const messageHash = keccak256(encodePacked(["address", "bytes32", "bytes32", "address", "uint256", "uint256"], [
            signingConfig.worldContractAddress,
            serverIdBytes32,
            sessionId,
            player,
            payout,
            deadline,
        ]));
        // Sign the message (signMessage automatically applies EIP-191 prefix)
        const signature = await account.signMessage({
            message: { raw: messageHash },
        });
        return {
            serverId: serverIdBytes32,
            sessionId,
            player,
            payout,
            deadline,
            signature: signature,
        };
    }
    /**
     * Serialize an ExitTicket for JSON storage/transport.
     */
    serializeTicket(ticket) {
        return {
            serverId: ticket.serverId,
            sessionId: ticket.sessionId,
            player: ticket.player,
            payout: ticket.payout.toString(),
            deadline: ticket.deadline.toString(),
            signature: ticket.signature,
        };
    }
    /**
     * Deserialize a SerializedExitTicket back to ExitTicket.
     */
    deserializeTicket(serialized) {
        return {
            serverId: serialized.serverId,
            sessionId: serialized.sessionId,
            player: serialized.player,
            payout: BigInt(serialized.payout),
            deadline: BigInt(serialized.deadline),
            signature: serialized.signature,
        };
    }
    // --------------------------------------------------------------------------
    // Public: Read Operations
    // --------------------------------------------------------------------------
    /**
     * Get the current balance of an account.
     */
    async getBalance(serverId, accountName) {
        const raw = await this.redis.get(this.keyAccount(serverId, accountName));
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
    async deposit(serverId, accountName, amountWei, idempotencyKey) {
        assertPositiveInt64(amountWei, this.maxAmount);
        if (amountWei === 0n)
            return this.getBalance(serverId, accountName);
        const balKey = this.keyAccount(serverId, accountName);
        // Fast path: no idempotency
        if (!idempotencyKey) {
            const next = await this.redis.incrby(balKey, amountWei.toString());
            return BigInt(next);
        }
        // Idempotent path
        const idKey = this.keyIdemp(serverId, idempotencyKey);
        return withOptimisticLock(this.redis, [balKey, idKey], async () => {
            const cached = await this.getCachedResult(idKey, "deposit");
            if (cached?.op === "deposit")
                return BigInt(cached.newBalanceWei);
            const tx = this.redis.multi();
            tx.incrby(balKey, amountWei.toString());
            const exec = await tx.exec();
            if (!exec)
                return null; // WATCH failed, retry
            const newBal = String(exec[0]?.[1] ?? "0");
            await this.storeIdempResult(idKey, { ok: true, op: "deposit", newBalanceWei: newBal });
            return BigInt(newBal);
        });
    }
    // --------------------------------------------------------------------------
    // Public: Burn
    // --------------------------------------------------------------------------
    /**
     * Debit an account by `amountWei` without crediting anywhere (destroy funds).
     * Returns true if successful, false if insufficient balance.
     *
     * If `idempotencyKey` is provided, the operation is idempotent.
     */
    async burn(serverId, accountName, amountWei, idempotencyKey) {
        assertPositiveInt64(amountWei, this.maxAmount);
        if (amountWei === 0n)
            return true;
        const balKey = this.keyAccount(serverId, accountName);
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
        const idKey = this.keyIdemp(serverId, idempotencyKey);
        return withOptimisticLock(this.redis, [balKey, idKey], async () => {
            const cached = await this.getCachedResult(idKey, "burn");
            if (cached)
                return cached.ok;
            const current = parseBalance(await this.redis.get(balKey));
            const ok = current >= amountWei;
            const tx = this.redis.multi();
            if (ok)
                tx.decrby(balKey, amountWei.toString());
            this.queueIdempResult(tx, idKey, { ok, op: "burn" });
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
    async transfer(serverId, fromAccountName, toAccountName, amountWei, idempotencyKey) {
        assertPositiveInt64(amountWei, this.maxAmount);
        if (amountWei === 0n)
            return true;
        const fromKey = this.keyAccount(serverId, fromAccountName);
        const toKey = this.keyAccount(serverId, toAccountName);
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
        const idKey = this.keyIdemp(serverId, idempotencyKey);
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
    // Public: Withdraw (Exit)
    // --------------------------------------------------------------------------
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
    async withdraw(serverId, wallet, amountWei, sessionId, signingConfig, idempotencyKey) {
        assertPositiveInt64(amountWei, this.maxAmount);
        const serverIdBytes32 = this.toBytes32(serverId);
        const normalizedWallet = wallet.toLowerCase();
        if (amountWei === 0n) {
            // Zero payout - still return a valid ticket
            return this.signExitTicket(serverIdBytes32, sessionId, normalizedWallet, 0n, signingConfig);
        }
        const fromKey = this.keyAccount(serverId, "server:world");
        const toKey = this.keyAccount(serverId, `user:pending:exit:${normalizedWallet}`);
        // Fast path: no idempotency
        if (!idempotencyKey) {
            const transferred = await withOptimisticLock(this.redis, [fromKey, toKey], async () => {
                const fromBal = parseBalance(await this.redis.get(fromKey));
                if (fromBal < amountWei)
                    return false;
                const tx = this.redis.multi();
                tx.decrby(fromKey, amountWei.toString());
                tx.incrby(toKey, amountWei.toString());
                const exec = await tx.exec();
                return exec ? true : null;
            });
            if (!transferred)
                return null;
            return this.signExitTicket(serverIdBytes32, sessionId, normalizedWallet, amountWei, signingConfig);
        }
        // Idempotent path
        const idKey = this.keyIdemp(serverId, idempotencyKey);
        return withOptimisticLock(this.redis, [fromKey, toKey, idKey], async () => {
            const cached = await this.getCachedResult(idKey, "withdraw");
            if (cached && cached.op === "withdraw") {
                if (!cached.ok)
                    return null;
                // Return cached ticket
                if (cached.ticket) {
                    return this.deserializeTicket(cached.ticket);
                }
                // Ticket missing from cache (shouldn't happen), regenerate
                return this.signExitTicket(serverIdBytes32, sessionId, normalizedWallet, amountWei, signingConfig);
            }
            const fromBal = parseBalance(await this.redis.get(fromKey));
            const ok = fromBal >= amountWei;
            if (!ok) {
                // Store failure result
                await this.storeIdempResult(idKey, { ok: false, op: "withdraw" });
                return null;
            }
            // Sign ticket first (before committing transfer)
            const ticket = await this.signExitTicket(serverIdBytes32, sessionId, normalizedWallet, amountWei, signingConfig);
            const tx = this.redis.multi();
            tx.decrby(fromKey, amountWei.toString());
            tx.incrby(toKey, amountWei.toString());
            this.queueIdempResult(tx, idKey, { ok: true, op: "withdraw", ticket: this.serializeTicket(ticket) });
            const exec = await tx.exec();
            if (!exec)
                return null; // WATCH failed, retry
            return ticket;
        });
    }
}
