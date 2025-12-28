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

/**
 * Convert mass to payout amount
 * 
 * @param mass - Player's final mass
 * @param massPerEth - Mass per ETH rate from server config
 * @param decimals - Asset token decimals (default: 18 for ETH/wei)
 * @returns Payout in asset tokens
 */
export function massToPayoutAmount(
  mass: number,
  massPerEth: number,
  decimals: number = 18
): bigint {
  // payout = mass / massPerEth * 10^decimals
  const payoutUsd = mass / massPerEth;
  return BigInt(Math.floor(payoutUsd * 10 ** decimals));
}

/**
 * Convert payout amount to mass
 * 
 * @param payout - Payout in asset tokens
 * @param massPerEth - Mass per ETH rate from server config
 * @param decimals - Asset token decimals (default: 18 for ETH/wei)
 * @returns Equivalent mass
 */
export function payoutAmountToMass(
  payout: bigint,
  massPerEth: number,
  decimals: number = 18
): number {
  // mass = payout / 10^decimals * massPerEth
  const payoutUsd = Number(payout) / 10 ** decimals;
  return payoutUsd * massPerEth;
}
