/**
 * Shared type definitions
 */
import type { PrivyClaims } from "./auth/privy.js";
/**
 * Exit ticket - signed by the server, redeemable by the player
 */
export interface ExitTicket {
    serverId: `0x${string}`;
    sessionId: `0x${string}`;
    player: `0x${string}`;
    payout: bigint;
    deadline: bigint;
    signature: `0x${string}`;
}
/**
 * Serialized exit ticket for storage/transmission
 */
export interface SerializedExitTicket {
    serverId: string;
    sessionId: string;
    player: string;
    payout: string;
    deadline: string;
    signature: string;
}
/**
 * Player data stored on client.userData
 */
export interface PlayerUserData {
    wallet: `0x${string}`;
    depositId?: `0x${string}`;
    spawnMass: bigint;
    privyClaims: PrivyClaims;
}
/**
 * Auth context returned from onAuth
 */
export interface AuthContext {
    privyClaims: PrivyClaims;
    wallet: `0x${string}` | null;
}
/**
 * Convert an ExitTicket to serializable format
 */
export declare function serializeExitTicket(ticket: ExitTicket): SerializedExitTicket;
/**
 * Convert a serialized ticket back to ExitTicket
 */
export declare function deserializeExitTicket(ticket: SerializedExitTicket): ExitTicket;
