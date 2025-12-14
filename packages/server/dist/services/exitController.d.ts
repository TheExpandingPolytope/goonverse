import type { ExitTicket } from "../types.js";
/**
 * Get the controller's public address
 */
export declare function getControllerAddress(): `0x${string}`;
/**
 * Create and sign an exit ticket
 *
 * The signature format must match World.sol's exitWithSignature verification:
 * ```solidity
 * bytes32 digest = keccak256(
 *     abi.encodePacked(
 *         address(this),
 *         serverId,
 *         sessionId,
 *         msg.sender,
 *         payout,
 *         deadline
 *     )
 * ).toEthSignedMessageHash();
 * ```
 *
 * @param sessionId - Unique session identifier
 * @param player - Player's wallet address
 * @param payout - Payout amount in asset tokens (e.g., native ETH in wei, 18 decimals)
 * @param deadlineSeconds - Seconds from now until ticket expires (default: 24h)
 * @returns The signed exit ticket
 */
export declare function createExitTicket(sessionId: `0x${string}`, player: `0x${string}`, payout: bigint, deadlineSeconds?: number): Promise<ExitTicket>;
/**
 * Generate a unique session ID
 *
 * Format: keccak256(serverId, player, nonce, timestamp)
 */
export declare function generateSessionId(player: `0x${string}`, nonce: number): `0x${string}`;
/**
 * Convert mass to payout amount
 *
 * @param mass - Player's final mass
 * @param massPerEth - Mass per ETH rate from server config
 * @param decimals - Asset token decimals (default: 18 for ETH/wei)
 * @returns Payout in asset tokens
 */
export declare function massToPayoutAmount(mass: number, massPerEth: number, decimals?: number): bigint;
/**
 * Convert payout amount to mass
 *
 * @param payout - Payout in asset tokens
 * @param massPerEth - Mass per ETH rate from server config
 * @param decimals - Asset token decimals (default: 18 for ETH/wei)
 * @returns Equivalent mass
 */
export declare function payoutAmountToMass(payout: bigint, massPerEth: number, decimals?: number): number;
/**
 * Store an exit ticket in Redis via Colyseus Presence
 *
 * @param presence - Colyseus Presence instance
 * @param ticket - The exit ticket to store
 */
export declare function storeExitTicket(presence: {
    setex: (key: string, value: string, seconds: number) => Promise<void>;
}, ticket: ExitTicket): Promise<void>;
/**
 * Retrieve an exit ticket from Redis
 *
 * @param presence - Colyseus Presence instance
 * @param serverId - Server ID
 * @param sessionId - Session ID
 * @returns The exit ticket if found, null otherwise
 */
export declare function getExitTicket(presence: {
    get: (key: string) => Promise<string | null>;
}, serverId: `0x${string}`, sessionId: `0x${string}`): Promise<ExitTicket | null>;
/**
 * Delete an exit ticket from Redis (after confirmed on-chain)
 *
 * @param presence - Colyseus Presence instance
 * @param serverId - Server ID
 * @param sessionId - Session ID
 */
export declare function deleteExitTicket(presence: {
    del: (key: string) => Promise<void>;
}, serverId: `0x${string}`, sessionId: `0x${string}`): Promise<void>;
