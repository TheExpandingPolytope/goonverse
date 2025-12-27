/**
 * Internal types for AccountManager.
 */

/** Stored idempotency record to return cached results on retry. */
export type IdempotentRecord =
  | { ok: true; op: "deposit"; newBalanceWei: string }
  | { ok: boolean; op: "withdraw" }
  | { ok: boolean; op: "transfer" }
  | { ok: boolean; op: "reserveExit" }
  | { ok: boolean; op: "releaseExit" };

/** Operation type for idempotency validation */
export type OpType = IdempotentRecord["op"];

