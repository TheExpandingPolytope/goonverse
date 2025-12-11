import Redis from "ioredis";
import { config } from "../config.js";

/**
 * Deposit Tracker Service
 * 
 * Tracks which deposits have been used to spawn blobs.
 * Uses Redis SET for atomic operations and persistence.
 * 
 * A deposit has two states:
 * - unused: Exists on-chain, never used to spawn
 * - used: Was used to spawn a blob (permanent, one-time flag)
 */

// Singleton Redis client for deposit tracking
let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redisUri, {
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
    });

    redisClient.on("error", (err) => {
      console.error("[DepositTracker] Redis error:", err);
    });

    redisClient.on("connect", () => {
      console.log("[DepositTracker] Redis connected");
    });
  }
  return redisClient;
}

/**
 * Get the Redis key for used deposits set
 */
function getUsedDepositsKey(serverId: string): string {
  return `used_deposits:${serverId.toLowerCase()}`;
}

/**
 * Check if a deposit has been used
 * 
 * @param serverId - The server ID
 * @param depositId - The deposit ID to check
 * @returns true if the deposit has been used, false otherwise
 */
export async function isDepositUsed(
  serverId: string,
  depositId: string
): Promise<boolean> {
  const redis = getRedisClient();
  const key = getUsedDepositsKey(serverId);
  const result = await redis.sismember(key, depositId.toLowerCase());
  return result === 1;
}

/**
 * Mark a deposit as used (atomic operation)
 * 
 * Uses Redis SADD which is atomic - if multiple requests try to mark
 * the same deposit, only one will succeed in adding it (returns 1),
 * others will see it already exists (returns 0).
 * 
 * @param serverId - The server ID
 * @param depositId - The deposit ID to mark as used
 * @returns true if this call marked it as used (first caller wins), false if already used
 */
export async function markDepositUsed(
  serverId: string,
  depositId: string
): Promise<boolean> {
  const redis = getRedisClient();
  const key = getUsedDepositsKey(serverId);
  // SADD returns 1 if the element was added, 0 if it already existed
  const result = await redis.sadd(key, depositId.toLowerCase());
  return result === 1;
}

/**
 * Atomically check and mark a deposit as used
 * 
 * This is the preferred method for the join flow - it combines
 * the check and mark into a single atomic operation.
 * 
 * @param serverId - The server ID
 * @param depositId - The deposit ID
 * @returns true if the deposit was unused and is now marked as used, false if already used
 */
export async function tryUseDeposit(
  serverId: string,
  depositId: string
): Promise<boolean> {
  // SADD is already atomic - returns 1 only if the element was new
  return markDepositUsed(serverId, depositId);
}

/**
 * Get all used deposit IDs for a server (for debugging/admin)
 * 
 * @param serverId - The server ID
 * @returns Set of used deposit IDs
 */
export async function getUsedDeposits(serverId: string): Promise<Set<string>> {
  const redis = getRedisClient();
  const key = getUsedDepositsKey(serverId);
  const members = await redis.smembers(key);
  return new Set(members);
}

/**
 * Remove a deposit from the used set (admin/recovery use only)
 * 
 * WARNING: This should only be used for admin recovery scenarios.
 * Normally deposits should never be "un-used".
 * 
 * @param serverId - The server ID
 * @param depositId - The deposit ID to remove
 */
export async function unmarkDepositUsed(
  serverId: string,
  depositId: string
): Promise<void> {
  const redis = getRedisClient();
  const key = getUsedDepositsKey(serverId);
  await redis.srem(key, depositId.toLowerCase());
}

/**
 * Close the Redis connection (for graceful shutdown)
 */
export async function closeDepositTracker(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

