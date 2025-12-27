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
export function serializeExitTicket(ticket: ExitTicket): SerializedExitTicket {
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
 * Convert a serialized ticket back to ExitTicket
 */
export function deserializeExitTicket(ticket: SerializedExitTicket): ExitTicket {
  return {
    serverId: ticket.serverId as `0x${string}`,
    sessionId: ticket.sessionId as `0x${string}`,
    player: ticket.player as `0x${string}`,
    payout: BigInt(ticket.payout),
    deadline: BigInt(ticket.deadline),
    signature: ticket.signature as `0x${string}`,
  };
}

