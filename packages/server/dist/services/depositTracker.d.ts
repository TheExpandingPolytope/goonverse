/**
 * Check if a deposit has been used
 *
 * @param serverId - The server ID
 * @param depositId - The deposit ID to check
 * @returns true if the deposit has been used, false otherwise
 */
export declare function isDepositUsed(serverId: string, depositId: string): Promise<boolean>;
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
export declare function markDepositUsed(serverId: string, depositId: string): Promise<boolean>;
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
export declare function tryUseDeposit(serverId: string, depositId: string): Promise<boolean>;
/**
 * Get all used deposit IDs for a server (for debugging/admin)
 *
 * @param serverId - The server ID
 * @returns Set of used deposit IDs
 */
export declare function getUsedDeposits(serverId: string): Promise<Set<string>>;
/**
 * Remove a deposit from the used set (admin/recovery use only)
 *
 * WARNING: This should only be used for admin recovery scenarios.
 * Normally deposits should never be "un-used".
 *
 * @param serverId - The server ID
 * @param depositId - The deposit ID to remove
 */
export declare function unmarkDepositUsed(serverId: string, depositId: string): Promise<void>;
/**
 * Close the Redis connection (for graceful shutdown)
 */
export declare function closeDepositTracker(): Promise<void>;
