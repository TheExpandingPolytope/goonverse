/**
 * Utility functions for Redis operations.
 */
import type Redis from "ioredis";
import { WATCH_MAX_RETRIES, WATCH_JITTER_MS } from "./constants.js";

/**
 * Assert that a bigint is within valid range for Redis int64 operations.
 */
export function assertPositiveInt64(amountWei: bigint, max: bigint): void {
  if (amountWei < 0n) {
    throw new Error("amountWei must be >= 0");
  }
  if (amountWei > max) {
    throw new Error(`amountWei exceeds int64 max: ${amountWei}`);
  }
}

/**
 * Parse a Redis string value as bigint balance.
 */
export function parseBalance(raw: string | null): bigint {
  return raw ? BigInt(raw) : 0n;
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function inside WATCH/MULTI with automatic retry on contention.
 * The function should return `null` to signal a retry is needed (WATCH failed).
 *
 * @param redis - Redis client instance
 * @param keys - Keys to watch for changes
 * @param fn - Function to execute; return null to retry, or a value to succeed
 * @returns The result from fn when successful
 */
export async function withOptimisticLock<T>(
  redis: Redis,
  keys: string[],
  fn: () => Promise<T | null>,
): Promise<T> {
  for (let attempt = 0; attempt < WATCH_MAX_RETRIES; attempt++) {
    await redis.watch(...keys);
    try {
      const result = await fn();
      if (result !== null) return result;
    } finally {
      try {
        await redis.unwatch();
      } catch {
        /* ignore unwatch errors */
      }
    }
    if (WATCH_JITTER_MS > 0) {
      await sleep(Math.floor(Math.random() * WATCH_JITTER_MS));
    }
  }
  throw new Error(`Optimistic lock retry limit exceeded for keys: ${keys.join(", ")}`);
}



