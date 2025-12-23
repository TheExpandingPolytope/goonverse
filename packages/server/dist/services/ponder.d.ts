/**
 * Deposit data from the Ponder indexer
 */
export interface Deposit {
    id: `0x${string}`;
    serverId: `0x${string}`;
    player: `0x${string}`;
    amount: bigint;
    spawnAmount: bigint;
    worldAmount: bigint;
    rakeAmount: bigint;
    blockNumber: bigint;
    timestamp: bigint;
    txHash: `0x${string}`;
}
/**
 * Exit data from the Ponder indexer
 */
export interface Exit {
    id: string;
    serverId: `0x${string}`;
    sessionId: `0x${string}`;
    player: `0x${string}`;
    payout: bigint;
    blockNumber: bigint;
    timestamp: bigint;
    txHash: `0x${string}`;
}
/**
 * Get a deposit by its ID
 */
export declare function getDeposit(depositId: `0x${string}`): Promise<Deposit | null>;
/**
 * Get deposits for a player on a specific server
 */
export declare function getPlayerDeposits(serverId: string, player: `0x${string}`): Promise<Deposit[]>;
/**
 * Get exits for a player on a specific server
 */
export declare function getPlayerExits(serverId: string, player: `0x${string}`): Promise<Exit[]>;
/**
 * Verify a deposit exists and is valid for joining
 *
 * @param serverId - The server ID
 * @param depositId - The deposit ID
 * @param player - The player's wallet address
 * @returns The deposit if valid, null otherwise
 */
export declare function verifyDeposit(serverId: string, depositId: `0x${string}`, player: `0x${string}`): Promise<Deposit | null>;
/**
 * Convert a serverId into bytes32 hex format for indexing/contract usage.
 *
 * - If `serverId` already starts with `0x`, we treat it as hex and right-pad it to 32 bytes.
 * - Otherwise we encode it as UTF-8 and right-pad it to 32 bytes.
 */
export declare function serverIdToBytes32(serverId: string): `0x${string}`;
/**
 * Get server configuration from the indexer
 */
export declare function getServer(serverId: string): Promise<{
    id: `0x${string}`;
    controller: `0x${string}`;
    buyInAmount: string;
    massPerEth: number;
    rakeShareBps: number;
    worldShareBps: number;
    exitHoldMs: number;
    isActive: boolean;
} | null>;
