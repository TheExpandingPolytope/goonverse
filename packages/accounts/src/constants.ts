/**
 * Default configuration values for AccountManager.
 */

/** Idempotency record TTL: 30 days */
export const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24 * 30;

/** Default exit ticket TTL: 24 hours */
export const DEFAULT_EXIT_TICKET_TTL_SECONDS = 60 * 60 * 24;

/** Maximum value for Redis int64 operations */
export const MAX_INT64 = 9_223_372_036_854_775_807n;

/** Maximum retries for optimistic lock (WATCH/MULTI) */
export const WATCH_MAX_RETRIES = 25;

/** Jitter between retries (ms) */
export const WATCH_JITTER_MS = 15;
