import Redis from "ioredis";
import { config } from "../config.js";
import { serverIdToBytes32 } from "./ponder.js";
/**
 * Accounting (centralized money logic)
 *
 * This module is the single place where we mutate any Redis-backed economic state.
 *
 * Design goals:
 * - minimal primitives: deposit / withdraw / transfer / addAccount
 * - no Lua scripts (use Redis WATCH + MULTI/EXEC retries)
 * - keep existing Redis key layout so we don't lose state
 *
 * Notes:
 * - Numeric balances are stored in **gwei units** (1e9 wei) so we can safely use Redis 64-bit integer ops.
 * - Idempotency for chain events is enforced via "seen" sets (deposits/exits).
 * - One-spawn-per-deposit is enforced via a separate "used_deposits" set.
 */
const UNIT_WEI = 1000000000n; // 1 gwei
function toGweiUnits(wei) {
    if (wei <= 0n)
        return 0n;
    return wei / UNIT_WEI;
}
function fromGweiUnits(units) {
    if (units <= 0n)
        return 0n;
    return units * UNIT_WEI;
}
// Singleton Redis client
let redisClient = null;
function getRedis() {
    if (!redisClient) {
        redisClient = new Redis(config.redisUri, {
            enableReadyCheck: false,
            maxRetriesPerRequest: 3,
        });
        redisClient.on("error", (err) => {
            console.error("[accounting] Redis error:", err);
        });
    }
    return redisClient;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function watchRetry(keys, fn, options) {
    const redis = getRedis();
    const maxRetries = options?.maxRetries ?? 25;
    const jitterMs = options?.jitterMs ?? 15;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        await redis.watch(...keys);
        try {
            const res = await fn();
            if (res !== null)
                return res;
        }
        finally {
            // If fn used MULTI/EXEC, Redis is automatically unwatched.
            // If fn returned early, ensure we release WATCH.
            try {
                await redis.unwatch();
            }
            catch {
                // ignore
            }
        }
        // brief jitter to avoid livelock under contention
        if (jitterMs > 0) {
            await sleep(Math.floor(Math.random() * jitterMs));
        }
    }
    throw new Error(`[accounting] WATCH/MULTI retry limit exceeded for keys: ${keys.join(", ")}`);
}
function kServer(serverId) {
    // Canonicalize to on-chain bytes32 so all callers map to the same buckets.
    return serverIdToBytes32(serverId).toLowerCase();
}
// --- Key layout (keep existing keys) ---
function keyDepositSeen(serverId) {
    return `balance:deposits_seen:${kServer(serverId)}`;
}
function keyExitSeen(serverId) {
    return `balance:exits_seen:${kServer(serverId)}`;
}
function keyPelletReserveGwei(serverId) {
    return `balance:pellet_reserve_gwei:${kServer(serverId)}`;
}
function keyBankrollObservedGwei(serverId) {
    return `balance:bankroll_observed_gwei:${kServer(serverId)}`;
}
function keyExitReservedTotalGwei(serverId) {
    return `balance:exit_reserved_total_gwei:${kServer(serverId)}`;
}
function keyExitReservationsHash(serverId) {
    return `balance:exit_reservations_gwei:${kServer(serverId)}`;
}
function keyExitReservationsExpiry(serverId) {
    return `balance:exit_reservations_expiry:${kServer(serverId)}`;
}
function keyDepositCursor(serverId) {
    return `balance:cursor:deposits:${kServer(serverId)}`;
}
function keyExitCursor(serverId) {
    return `balance:cursor:exits:${kServer(serverId)}`;
}
// Deposit usage tracking (keep existing key)
function keyUsedDeposits(serverId) {
    return `used_deposits:${serverId.toLowerCase()}`;
}
function keyForAccount(account) {
    switch (account.kind) {
        case "PelletReserve":
            return keyPelletReserveGwei(account.serverId);
        case "BankrollObserved":
            return keyBankrollObservedGwei(account.serverId);
        case "ExitReservedTotal":
            return keyExitReservedTotalGwei(account.serverId);
        default: {
            const _exhaustive = account;
            return _exhaustive;
        }
    }
}
export async function addAccount(_account) {
    // Redis is schemaless. We keep this for API symmetry and future-proofing.
    return;
}
export async function deposit(account, amountWei) {
    const units = toGweiUnits(amountWei);
    if (units <= 0n)
        return;
    const redis = getRedis();
    await redis.incrby(keyForAccount(account), units.toString());
}
export async function withdraw(account, amountWei) {
    const spendUnits = toGweiUnits(amountWei);
    if (spendUnits <= 0n)
        return true;
    const redis = getRedis();
    const key = keyForAccount(account);
    return await watchRetry([key], async () => {
        const currentRaw = await redis.get(key);
        const current = currentRaw ? BigInt(currentRaw) : 0n;
        if (current < spendUnits)
            return false;
        const tx = redis.multi();
        tx.decrby(key, spendUnits.toString());
        const res = await tx.exec();
        if (res === null)
            return null; // retry
        return true;
    });
}
export async function transfer(from, to, amountWei) {
    const units = toGweiUnits(amountWei);
    if (units <= 0n)
        return true;
    const redis = getRedis();
    const fromKey = keyForAccount(from);
    const toKey = keyForAccount(to);
    return await watchRetry([fromKey, toKey], async () => {
        const fromRaw = await redis.get(fromKey);
        const fromBal = fromRaw ? BigInt(fromRaw) : 0n;
        if (fromBal < units)
            return false;
        const tx = redis.multi();
        tx.decrby(fromKey, units.toString());
        tx.incrby(toKey, units.toString());
        const res = await tx.exec();
        if (res === null)
            return null;
        return true;
    });
}
// --- Read helpers (existing API equivalents) ---
export async function getPelletReserveWei(serverId) {
    const redis = getRedis();
    const raw = await redis.get(keyPelletReserveGwei(serverId));
    const units = raw ? BigInt(raw) : 0n;
    return fromGweiUnits(units);
}
export async function getObservedBankrollWei(serverId) {
    const redis = getRedis();
    const raw = await redis.get(keyBankrollObservedGwei(serverId));
    const units = raw ? BigInt(raw) : 0n;
    return fromGweiUnits(units);
}
export async function getReservedExitLiquidityWei(serverId) {
    const redis = getRedis();
    const raw = await redis.get(keyExitReservedTotalGwei(serverId));
    const units = raw ? BigInt(raw) : 0n;
    return fromGweiUnits(units);
}
/**
 * Atomically apply a deposit into Redis-backed balances exactly once.
 *
 * - pelletReserve += worldAmount
 * - bankrollObserved += (spawnAmount + worldAmount)
 */
async function applyDepositAtomic(serverId, depositId, spawnWei, worldWei) {
    const redis = getRedis();
    const depositSeen = keyDepositSeen(serverId);
    const pelletKey = keyPelletReserveGwei(serverId);
    const bankrollKey = keyBankrollObservedGwei(serverId);
    const pelletUnits = toGweiUnits(worldWei);
    const bankrollUnits = toGweiUnits(spawnWei + worldWei);
    const id = depositId.toLowerCase();
    // Nothing to do if both are zero (e.g., tiny values that round to < 1 gwei).
    if (pelletUnits <= 0n && bankrollUnits <= 0n) {
        const added = await redis.sadd(depositSeen, id);
        return added === 1;
    }
    return await watchRetry([depositSeen], async () => {
        const already = await redis.sismember(depositSeen, id);
        if (already === 1)
            return false;
        const tx = redis.multi();
        tx.sadd(depositSeen, id);
        if (pelletUnits > 0n)
            tx.incrby(pelletKey, pelletUnits.toString());
        if (bankrollUnits > 0n)
            tx.incrby(bankrollKey, bankrollUnits.toString());
        const res = await tx.exec();
        if (res === null)
            return null;
        return true;
    });
}
/**
 * Ensure a deposit's balances are applied exactly once.
 *
 * Safe to call on the join path to avoid races with background sync.
 */
export async function applyDepositToBalances(input) {
    return await applyDepositAtomic(input.serverId, input.id, input.spawnAmountWei, input.worldAmountWei);
}
/**
 * Atomically apply an on-chain exit into the observed bankroll exactly once.
 */
async function applyExitAtomic(serverId, exitId, payoutWei) {
    const redis = getRedis();
    const exitSeen = keyExitSeen(serverId);
    const bankrollKey = keyBankrollObservedGwei(serverId);
    const payoutUnits = toGweiUnits(payoutWei);
    if (payoutUnits <= 0n) {
        const added = await redis.sadd(exitSeen, exitId);
        return added === 1;
    }
    return await watchRetry([exitSeen], async () => {
        const already = await redis.sismember(exitSeen, exitId);
        if (already === 1)
            return false;
        const tx = redis.multi();
        tx.sadd(exitSeen, exitId);
        tx.decrby(bankrollKey, payoutUnits.toString());
        const res = await tx.exec();
        if (res === null)
            return null;
        return true;
    });
}
// --- Gameplay helpers (pellet reserve) ---
export async function creditPelletReserveWei(serverId, amountWei) {
    await deposit({ serverId, kind: "PelletReserve" }, amountWei);
}
export async function trySpendPelletReserveWei(serverId, amountWei) {
    return await withdraw({ serverId, kind: "PelletReserve" }, amountWei);
}
// --- Exit ticket reservations (hold-to-exit) ---
export async function reserveExitLiquidityWei(params) {
    const { serverId, sessionId, payoutWei, ttlSeconds } = params;
    const reserveUnits = toGweiUnits(payoutWei);
    if (reserveUnits <= 0n)
        return true;
    const redis = getRedis();
    const bankrollKey = keyBankrollObservedGwei(serverId);
    const reservedTotalKey = keyExitReservedTotalGwei(serverId);
    const reservationsHash = keyExitReservationsHash(serverId);
    const expiryZset = keyExitReservationsExpiry(serverId);
    const nowSec = Math.floor(Date.now() / 1000);
    const expirySec = nowSec + Math.max(1, ttlSeconds);
    return await watchRetry([bankrollKey, reservedTotalKey, reservationsHash], async () => {
        const exists = await redis.hexists(reservationsHash, sessionId);
        if (exists === 1)
            return false;
        const bankrollRaw = await redis.get(bankrollKey);
        const reservedRaw = await redis.get(reservedTotalKey);
        const bankroll = bankrollRaw ? BigInt(bankrollRaw) : 0n;
        const reserved = reservedRaw ? BigInt(reservedRaw) : 0n;
        if (reserved + reserveUnits > bankroll)
            return false;
        const tx = redis.multi();
        tx.hset(reservationsHash, sessionId, reserveUnits.toString());
        tx.zadd(expiryZset, expirySec, sessionId);
        tx.incrby(reservedTotalKey, reserveUnits.toString());
        const res = await tx.exec();
        if (res === null)
            return null;
        return true;
    });
}
export async function releaseExitReservation(serverId, sessionId) {
    const redis = getRedis();
    const reservedTotalKey = keyExitReservedTotalGwei(serverId);
    const reservationsHash = keyExitReservationsHash(serverId);
    const expiryZset = keyExitReservationsExpiry(serverId);
    return await watchRetry([reservedTotalKey, reservationsHash], async () => {
        const amt = await redis.hget(reservationsHash, sessionId);
        if (!amt)
            return false;
        const tx = redis.multi();
        tx.hdel(reservationsHash, sessionId);
        tx.zrem(expiryZset, sessionId);
        tx.decrby(reservedTotalKey, amt);
        const res = await tx.exec();
        if (res === null)
            return null;
        return true;
    });
}
async function sweepExpiredReservations(serverId, limit = 200) {
    const redis = getRedis();
    const expiryZset = keyExitReservationsExpiry(serverId);
    const nowSec = Math.floor(Date.now() / 1000);
    const expired = await redis.zrangebyscore(expiryZset, "-inf", nowSec, "LIMIT", 0, limit);
    for (const sessionId of expired) {
        await releaseExitReservation(serverId, sessionId);
    }
}
// --- One-spawn-per-deposit tracking ---
export async function isDepositUsed(serverId, depositId) {
    const redis = getRedis();
    const result = await redis.sismember(keyUsedDeposits(serverId), depositId.toLowerCase());
    return result === 1;
}
export async function tryUseDeposit(serverId, depositId) {
    const redis = getRedis();
    const result = await redis.sadd(keyUsedDeposits(serverId), depositId.toLowerCase());
    return result === 1;
}
// --- Background sync (formerly startBalanceSync) ---
async function graphqlQuery(query, variables) {
    const response = await fetch(`${config.ponderUrl}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
        throw new Error(`Ponder GraphQL request failed: ${response.status} ${response.statusText}`);
    }
    const result = (await response.json());
    if (result.errors?.length) {
        throw new Error(`Ponder GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`);
    }
    if (!result.data) {
        throw new Error("Ponder GraphQL returned no data");
    }
    return result.data;
}
/**
 * Background sync that ensures pellet reserve increases for EVERY deposit (worldAmount),
 * regardless of whether the depositor ever joins a room.
 *
 * It also tracks an observed on-chain bankroll (spawnAmount + worldAmount - exits).
 */
export function startAccountingSync(options) {
    const serverId = options?.serverId ?? config.serverId;
    const pollIntervalMs = options?.pollIntervalMs ?? 5000;
    const pageSize = options?.pageSize ?? 200;
    let stopped = false;
    const stop = () => {
        stopped = true;
    };
    (async () => {
        const redis = getRedis();
        console.log(`[accounting] Starting sync for serverId ${serverId} (poll=${pollIntervalMs}ms)`);
        const depositsQuery = `
      query DepositsPage($serverId: String!, $after: String, $limit: Int!) {
        depositss(where: { serverId: $serverId }, orderBy: "timestamp", orderDirection: "asc", after: $after, limit: $limit) {
          items { id serverId spawnAmount worldAmount blockNumber timestamp txHash }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;
        const exitsQuery = `
      query ExitsPage($serverId: String!, $after: String, $limit: Int!) {
        exitss(where: { serverId: $serverId }, orderBy: "timestamp", orderDirection: "asc", after: $after, limit: $limit) {
          items { id serverId sessionId player payout blockNumber timestamp txHash }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;
        while (!stopped) {
            try {
                await sweepExpiredReservations(serverId);
                // --- Deposits ---
                let depositCursor = await redis.get(keyDepositCursor(serverId));
                while (!stopped) {
                    const data = await graphqlQuery(depositsQuery, {
                        serverId,
                        after: depositCursor,
                        limit: pageSize,
                    });
                    const items = data.depositss.items ?? [];
                    for (const d of items) {
                        const spawnWei = BigInt(d.spawnAmount ?? "0");
                        const worldWei = BigInt(d.worldAmount ?? "0");
                        await applyDepositAtomic(serverId, d.id, spawnWei, worldWei);
                    }
                    const endCursor = data.depositss.pageInfo.endCursor ?? null;
                    if (endCursor) {
                        depositCursor = endCursor;
                        await redis.set(keyDepositCursor(serverId), depositCursor);
                    }
                    if (!data.depositss.pageInfo.hasNextPage)
                        break;
                }
                // --- Exits ---
                let exitCursor = await redis.get(keyExitCursor(serverId));
                while (!stopped) {
                    const data = await graphqlQuery(exitsQuery, {
                        serverId,
                        after: exitCursor,
                        limit: pageSize,
                    });
                    const items = data.exitss.items ?? [];
                    for (const e of items) {
                        const payoutWei = BigInt(e.payout ?? "0");
                        await applyExitAtomic(serverId, e.id, payoutWei);
                        // Release any outstanding reservation for this sessionId if we issued a ticket.
                        await releaseExitReservation(serverId, e.sessionId);
                    }
                    const endCursor = data.exitss.pageInfo.endCursor ?? null;
                    if (endCursor) {
                        exitCursor = endCursor;
                        await redis.set(keyExitCursor(serverId), exitCursor);
                    }
                    if (!data.exitss.pageInfo.hasNextPage)
                        break;
                }
            }
            catch (error) {
                console.error("[accounting] sync error:", error);
            }
            await sleep(pollIntervalMs);
        }
        console.log(`[accounting] Stopped sync for serverId ${serverId}`);
    })();
    return stop;
}
