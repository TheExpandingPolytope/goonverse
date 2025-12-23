import Redis from "ioredis";
import { config } from "../config.js";
import { serverIdToBytes32 } from "./ponder.js";
/**
 * Centralized economic balances (Redis-backed).
 *
 * We store values in **gwei units** (1e9 wei) to stay within Redis 64-bit integer ops.
 * This is conservative (rounds down), and is safe for solvency (we may spawn slightly fewer
 * pellets than the absolute theoretical maximum, but never overspend).
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
            console.error("[balance] Redis error:", err);
        });
    }
    return redisClient;
}
function kServer(serverId) {
    // Canonicalize to on-chain bytes32 so all callers (human ids or bytes32) map to the same bucket.
    return serverIdToBytes32(serverId).toLowerCase();
}
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
 * Atomically apply a deposit into Redis-backed balances exactly once.
 *
 * - pelletReserve += worldAmount
 * - bankrollObserved += (spawnAmount + worldAmount)
 */
async function applyDepositAtomic(serverId, depositId, spawnWei, worldWei) {
    const redis = getRedis();
    const depositKey = keyDepositSeen(serverId);
    const pelletKey = keyPelletReserveGwei(serverId);
    const bankrollKey = keyBankrollObservedGwei(serverId);
    const pelletUnits = toGweiUnits(worldWei);
    const bankrollUnits = toGweiUnits(spawnWei + worldWei);
    // Nothing to do if both are zero (e.g., tiny values that round to < 1 gwei).
    if (pelletUnits <= 0n && bankrollUnits <= 0n) {
        // Still mark as seen so we don't spin on it.
        const added = await redis.sadd(depositKey, depositId.toLowerCase());
        return added === 1;
    }
    const script = `
    -- KEYS[1] depositSeenSet
    -- KEYS[2] pelletReserveGweiKey
    -- KEYS[3] bankrollObservedGweiKey
    -- ARGV[1] depositId
    -- ARGV[2] pelletUnits
    -- ARGV[3] bankrollUnits
    local added = redis.call("SADD", KEYS[1], ARGV[1])
    if added == 0 then
      return 0
    end
    if tonumber(ARGV[2]) > 0 then
      redis.call("INCRBY", KEYS[2], ARGV[2])
    end
    if tonumber(ARGV[3]) > 0 then
      redis.call("INCRBY", KEYS[3], ARGV[3])
    end
    return 1
  `;
    const res = (await redis.eval(script, 3, depositKey, pelletKey, bankrollKey, depositId.toLowerCase(), pelletUnits.toString(), bankrollUnits.toString()));
    return res === 1;
}
/**
 * Atomically apply an on-chain exit into the observed bankroll exactly once.
 */
async function applyExitAtomic(serverId, exitId, payoutWei) {
    const redis = getRedis();
    const exitSeenKey = keyExitSeen(serverId);
    const bankrollKey = keyBankrollObservedGwei(serverId);
    const payoutUnits = toGweiUnits(payoutWei);
    const script = `
    -- KEYS[1] exitsSeenSet
    -- KEYS[2] bankrollObservedGweiKey
    -- ARGV[1] exitId
    -- ARGV[2] payoutUnits
    local added = redis.call("SADD", KEYS[1], ARGV[1])
    if added == 0 then
      return 0
    end
    if tonumber(ARGV[2]) > 0 then
      redis.call("DECRBY", KEYS[2], ARGV[2])
    end
    return 1
  `;
    const res = (await redis.eval(script, 2, exitSeenKey, bankrollKey, exitId, payoutUnits.toString()));
    return res === 1;
}
export async function getPelletReserveWei(serverId) {
    const redis = getRedis();
    const raw = await redis.get(keyPelletReserveGwei(serverId));
    const units = raw ? BigInt(raw) : 0n;
    return fromGweiUnits(units);
}
/**
 * Ensure a deposit's balances are applied exactly once.
 *
 * Safe to call on the join path to avoid races with background sync.
 */
export async function applyDepositToBalances(input) {
    return await applyDepositAtomic(input.serverId, input.id, input.spawnAmountWei, input.worldAmountWei);
}
export async function creditPelletReserveWei(serverId, amountWei) {
    const units = toGweiUnits(amountWei);
    if (units <= 0n)
        return;
    const redis = getRedis();
    await redis.incrby(keyPelletReserveGwei(serverId), units.toString());
}
export async function trySpendPelletReserveWei(serverId, amountWei) {
    const spendUnits = toGweiUnits(amountWei);
    if (spendUnits <= 0n)
        return true;
    const redis = getRedis();
    const reserveKey = keyPelletReserveGwei(serverId);
    const script = `
    -- KEYS[1] pelletReserveGweiKey
    -- ARGV[1] spendUnits
    local current = tonumber(redis.call("GET", KEYS[1]) or "0")
    local spend = tonumber(ARGV[1])
    if current < spend then
      return 0
    end
    redis.call("DECRBY", KEYS[1], ARGV[1])
    return 1
  `;
    const res = (await redis.eval(script, 1, reserveKey, spendUnits.toString()));
    return res === 1;
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
    const script = `
    -- KEYS[1] bankrollObservedGweiKey
    -- KEYS[2] reservedTotalGweiKey
    -- KEYS[3] reservationsHash
    -- KEYS[4] expiryZset
    -- ARGV[1] sessionId
    -- ARGV[2] reserveUnits
    -- ARGV[3] expirySec
    local sid = ARGV[1]
    if redis.call("HEXISTS", KEYS[3], sid) == 1 then
      return 0
    end
    local bankroll = tonumber(redis.call("GET", KEYS[1]) or "0")
    local reserved = tonumber(redis.call("GET", KEYS[2]) or "0")
    local amt = tonumber(ARGV[2])
    if (reserved + amt) > bankroll then
      return 0
    end
    redis.call("HSET", KEYS[3], sid, ARGV[2])
    redis.call("ZADD", KEYS[4], ARGV[3], sid)
    redis.call("INCRBY", KEYS[2], ARGV[2])
    return 1
  `;
    const ok = (await redis.eval(script, 4, bankrollKey, reservedTotalKey, reservationsHash, expiryZset, sessionId, reserveUnits.toString(), expirySec.toString()));
    return ok === 1;
}
export async function releaseExitReservation(serverId, sessionId) {
    const redis = getRedis();
    const reservedTotalKey = keyExitReservedTotalGwei(serverId);
    const reservationsHash = keyExitReservationsHash(serverId);
    const expiryZset = keyExitReservationsExpiry(serverId);
    const script = `
    -- KEYS[1] reservedTotalGweiKey
    -- KEYS[2] reservationsHash
    -- KEYS[3] expiryZset
    -- ARGV[1] sessionId
    local sid = ARGV[1]
    local amt = redis.call("HGET", KEYS[2], sid)
    if not amt then
      return 0
    end
    redis.call("HDEL", KEYS[2], sid)
    redis.call("ZREM", KEYS[3], sid)
    redis.call("DECRBY", KEYS[1], amt)
    return 1
  `;
    const ok = (await redis.eval(script, 3, reservedTotalKey, reservationsHash, expiryZset, sessionId));
    return ok === 1;
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
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Background sync that ensures pellet reserve increases for EVERY deposit (worldAmount),
 * regardless of whether the depositor ever joins a room.
 *
 * It also tracks an observed on-chain bankroll (spawnAmount + worldAmount - exits).
 */
export function startBalanceSync(options) {
    const serverId = options?.serverId ?? config.serverId;
    const pollIntervalMs = options?.pollIntervalMs ?? 5000;
    const pageSize = options?.pageSize ?? 200;
    let stopped = false;
    const stop = () => {
        stopped = true;
    };
    (async () => {
        const redis = getRedis();
        console.log(`[balance] Starting balance sync for serverId ${serverId} (poll=${pollIntervalMs}ms)`);
        const depositsQuery = `
      query DepositsPage($serverId: String!, $after: String, $limit: Int!) {
        depositss(where: { serverId: $serverId }, orderBy: "timestamp", orderDirection: "asc", after: $after, limit: $limit) {
          items { id serverId spawnAmount worldAmount rakeAmount blockNumber timestamp txHash }
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
                // Periodically sweep expired exit reservations so reserved totals don't leak.
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
                    if (!data.depositss.pageInfo.hasNextPage) {
                        break;
                    }
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
                    if (!data.exitss.pageInfo.hasNextPage) {
                        break;
                    }
                }
            }
            catch (error) {
                console.error("[balance] sync error:", error);
            }
            await sleep(pollIntervalMs);
        }
        console.log(`[balance] Stopped balance sync for serverId ${serverId}`);
    })();
    return stop;
}
