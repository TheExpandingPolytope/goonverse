/**
 * Utility functions for Redis operations.
 */
import type Redis from "ioredis";
/**
 * Assert that a bigint is within valid range for Redis int64 operations.
 */
export declare function assertPositiveInt64(amountWei: bigint, max: bigint): void;
/**
 * Parse a Redis string value as bigint balance.
 */
export declare function parseBalance(raw: string | null): bigint;
/**
 * Sleep for a given number of milliseconds.
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * Execute a function inside WATCH/MULTI with automatic retry on contention.
 * The function should return `null` to signal a retry is needed (WATCH failed).
 *
 * @param redis - Redis client instance
 * @param keys - Keys to watch for changes
 * @param fn - Function to execute; return null to retry, or a value to succeed
 * @returns The result from fn when successful
 */
export declare function withOptimisticLock<T>(redis: Redis, keys: string[], fn: () => Promise<T | null>): Promise<T>;
