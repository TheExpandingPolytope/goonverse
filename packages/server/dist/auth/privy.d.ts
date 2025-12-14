/**
 * Verified claims from a Privy access token
 */
export interface PrivyClaims {
    /** Privy DID (user identifier) */
    userId: string;
    /** Privy app ID */
    appId: string;
    /** Session ID */
    sessionId: string;
    /** Token issuer (always 'privy.io') */
    issuer: string;
    /** Unix timestamp when token was issued */
    issuedAt: number;
    /** Unix timestamp when token expires */
    expiration: number;
}
/**
 * Verify a Privy access token and return the claims
 *
 * @param accessToken - The JWT access token from the client
 * @returns The verified claims, or null if invalid
 */
export declare function verifyPrivyToken(accessToken: string): Promise<PrivyClaims | null>;
/**
 * Get user data from Privy by their DID
 * Useful for fetching linked wallets
 */
export declare function getPrivyUser(userId: string): Promise<import("@privy-io/server-auth").User | null>;
/**
 * Extract the primary wallet address from a Privy user
 */
export declare function getPrimaryWallet(user: Awaited<ReturnType<typeof getPrivyUser>>): `0x${string}` | null;
