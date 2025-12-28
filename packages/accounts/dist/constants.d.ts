/**
 * Default configuration values for AccountManager.
 */
/** Idempotency record TTL: 30 days */
export declare const DEFAULT_IDEMPOTENCY_TTL_SECONDS: number;
/** Default exit ticket TTL: 24 hours */
export declare const DEFAULT_EXIT_TICKET_TTL_SECONDS: number;
/** Maximum value for Redis int64 operations */
export declare const MAX_INT64 = 9223372036854775807n;
/** Maximum retries for optimistic lock (WATCH/MULTI) */
export declare const WATCH_MAX_RETRIES = 25;
/** Jitter between retries (ms) */
export declare const WATCH_JITTER_MS = 15;
