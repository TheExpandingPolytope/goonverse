/**
 * Shared type definitions
 */

import type { PrivyClaims } from "./auth/privy.js";

// Re-export exit ticket types from the accounts package
export type { ExitTicket, SerializedExitTicket } from "@goonverse/accounts";

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
