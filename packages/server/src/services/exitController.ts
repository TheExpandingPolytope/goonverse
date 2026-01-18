/**
 * Exit ticket utilities.
 * 
 * Signing logic has been moved to AccountManager in @goonverse/accounts.
 * This file contains utility functions for session ID generation and mass/payout conversion.
 */

import { keccak256, encodePacked } from "viem";
import { config } from "../config.js";
import { serverIdToBytes32 } from "./ponder.js";

/**
 * Canonical bytes32 serverId used for session ID generation.
 */
const serverIdBytes32 = serverIdToBytes32(config.serverId);

/**
 * Generate a unique session ID
 * 
 * Format: keccak256(serverId, player, nonce, timestamp)
 */
export function generateSessionId(
  player: `0x${string}`,
  nonce: number
): `0x${string}` {
  return keccak256(
    encodePacked(
      ["bytes32", "address", "uint256", "uint256"],
      [serverIdBytes32, player, BigInt(nonce), BigInt(Date.now())]
    )
  );
}

const MASS_SCALE = 10_000;

/**
 * Convert mass to payout amount (fixed-point, floor).
 *
 * @param mass - Player's final mass (scaled by MASS_SCALE)
 * @param massPerEth - Display mass per ETH rate from server config
 * @param decimals - Asset token decimals (default: 18 for ETH/wei)
 * @returns Payout in asset tokens
 */
export function massToPayoutAmount(
  mass: number,
  massPerEth: number,
  decimals: number = 18,
): bigint {
  if (!Number.isFinite(massPerEth) || massPerEth <= 0) return 0n;
  const denom = BigInt(Math.floor(massPerEth)) * BigInt(MASS_SCALE);
  const numerator = BigInt(Math.max(0, Math.floor(mass))) * 10n ** BigInt(decimals);
  return numerator / denom;
}

/**
 * Convert payout amount to mass (fixed-point, floor).
 *
 * @param payout - Payout in asset tokens
 * @param massPerEth - Display mass per ETH rate from server config
 * @param decimals - Asset token decimals (default: 18 for ETH/wei)
 * @returns Equivalent mass (scaled by MASS_SCALE)
 */
export function payoutAmountToMass(
  payout: bigint,
  massPerEth: number,
  decimals: number = 18,
): number {
  if (!Number.isFinite(massPerEth) || massPerEth <= 0) return 0;
  const numer = payout * BigInt(Math.floor(massPerEth)) * BigInt(MASS_SCALE);
  const denom = 10n ** BigInt(decimals);
  return Number(numer / denom);
}
