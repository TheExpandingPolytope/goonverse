/**
 * Types for AccountManager.
 */

/**
 * Exit ticket returned by withdraw() - contains signed authorization for on-chain exit.
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
 * Serialized exit ticket for JSON transport.
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
 * Signing configuration for withdraw() - passed per-call.
 */
export interface SigningConfig {
  controllerPrivateKey: `0x${string}`;
  worldContractAddress: `0x${string}`;
  exitTicketTtlSeconds?: number;
}

/** Stored idempotency record to return cached results on retry. */
export type IdempotentRecord =
  | { ok: true; op: "deposit"; newBalanceWei: string }
  | { ok: boolean; op: "withdraw"; ticket?: SerializedExitTicket }
  | { ok: boolean; op: "transfer" }
  | { ok: boolean; op: "burn" };

/** Operation type for idempotency validation */
export type OpType = IdempotentRecord["op"];
