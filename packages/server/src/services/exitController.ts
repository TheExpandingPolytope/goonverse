import {
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  toHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { config } from "../config.js";
import type { ExitTicket, SerializedExitTicket } from "../types.js";

/**
 * The controller account derived from the private key
 */
const controllerAccount = privateKeyToAccount(config.controllerPrivateKey);

/**
 * Wallet client for signing
 */
const walletClient = createWalletClient({
  account: controllerAccount,
  chain: config.nodeEnv === "production" ? base : baseSepolia,
  transport: http(),
});

/**
 * Get the controller's public address
 */
export function getControllerAddress(): `0x${string}` {
  return controllerAccount.address;
}

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
 * @param payout - Payout amount in asset tokens (e.g., USDC with 6 decimals)
 * @param deadlineSeconds - Seconds from now until ticket expires (default: 24h)
 * @returns The signed exit ticket
 */
export async function createExitTicket(
  sessionId: `0x${string}`,
  player: `0x${string}`,
  payout: bigint,
  deadlineSeconds: number = config.exitTicketTtlSeconds
): Promise<ExitTicket> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

  // Create the message hash matching World.sol's abi.encodePacked format
  const messageHash = keccak256(
    encodePacked(
      ["address", "bytes32", "bytes32", "address", "uint256", "uint256"],
      [
        config.worldContractAddress,
        config.serverId,
        sessionId,
        player,
        payout,
        deadline,
      ]
    )
  );

  // Sign the message (viem's signMessage automatically applies EIP-191 prefix)
  const signature = await walletClient.signMessage({
    message: { raw: messageHash as Hex },
  });

  return {
    serverId: config.serverId,
    sessionId,
    player,
    payout,
    deadline,
    signature,
  };
}

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
      [config.serverId, player, BigInt(nonce), BigInt(Date.now())]
    )
  );
}

/**
 * Convert mass to payout amount
 * 
 * @param mass - Player's final mass
 * @param massPerDollar - Mass per dollar rate from server config
 * @param decimals - Asset token decimals (default: 6 for USDC)
 * @returns Payout in asset tokens
 */
export function massToPayoutAmount(
  mass: number,
  massPerDollar: number,
  decimals: number = 6
): bigint {
  // payout = mass / massPerDollar * 10^decimals
  const payoutUsd = mass / massPerDollar;
  return BigInt(Math.floor(payoutUsd * 10 ** decimals));
}

/**
 * Convert payout amount to mass
 * 
 * @param payout - Payout in asset tokens
 * @param massPerDollar - Mass per dollar rate from server config
 * @param decimals - Asset token decimals (default: 6 for USDC)
 * @returns Equivalent mass
 */
export function payoutAmountToMass(
  payout: bigint,
  massPerDollar: number,
  decimals: number = 6
): number {
  // mass = payout / 10^decimals * massPerDollar
  const payoutUsd = Number(payout) / 10 ** decimals;
  return payoutUsd * massPerDollar;
}

/**
 * Store an exit ticket in Redis via Colyseus Presence
 * 
 * @param presence - Colyseus Presence instance
 * @param ticket - The exit ticket to store
 */
export async function storeExitTicket(
  presence: { setex: (key: string, value: string, seconds: number) => Promise<void> },
  ticket: ExitTicket
): Promise<void> {
  const key = `exit_ticket:${ticket.serverId}:${ticket.sessionId}`;
  const serialized: SerializedExitTicket = {
    serverId: ticket.serverId,
    sessionId: ticket.sessionId,
    player: ticket.player,
    payout: ticket.payout.toString(),
    deadline: ticket.deadline.toString(),
    signature: ticket.signature,
  };

  const ttlSeconds = Number(ticket.deadline) - Math.floor(Date.now() / 1000);
  if (ttlSeconds > 0) {
    await presence.setex(key, JSON.stringify(serialized), ttlSeconds);
  }
}

/**
 * Retrieve an exit ticket from Redis
 * 
 * @param presence - Colyseus Presence instance
 * @param serverId - Server ID
 * @param sessionId - Session ID
 * @returns The exit ticket if found, null otherwise
 */
export async function getExitTicket(
  presence: { get: (key: string) => Promise<string | null> },
  serverId: `0x${string}`,
  sessionId: `0x${string}`
): Promise<ExitTicket | null> {
  const key = `exit_ticket:${serverId}:${sessionId}`;
  const value = await presence.get(key);

  if (!value) {
    return null;
  }

  try {
    const serialized = JSON.parse(value) as SerializedExitTicket;
    return {
      serverId: serialized.serverId as `0x${string}`,
      sessionId: serialized.sessionId as `0x${string}`,
      player: serialized.player as `0x${string}`,
      payout: BigInt(serialized.payout),
      deadline: BigInt(serialized.deadline),
      signature: serialized.signature as `0x${string}`,
    };
  } catch {
    return null;
  }
}

/**
 * Delete an exit ticket from Redis (after confirmed on-chain)
 * 
 * @param presence - Colyseus Presence instance
 * @param serverId - Server ID
 * @param sessionId - Session ID
 */
export async function deleteExitTicket(
  presence: { del: (key: string) => Promise<void> },
  serverId: `0x${string}`,
  sessionId: `0x${string}`
): Promise<void> {
  const key = `exit_ticket:${serverId}:${sessionId}`;
  await presence.del(key);
}

