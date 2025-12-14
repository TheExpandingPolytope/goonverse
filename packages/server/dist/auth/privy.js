import { PrivyClient } from "@privy-io/server-auth";
import { config } from "../config.js";
/**
 * Privy client instance for JWT verification
 */
const privyClient = new PrivyClient(config.privyAppId, config.privyAppSecret);
/**
 * Verify a Privy access token and return the claims
 *
 * @param accessToken - The JWT access token from the client
 * @returns The verified claims, or null if invalid
 */
export async function verifyPrivyToken(accessToken) {
    try {
        const verifiedClaims = await privyClient.verifyAuthToken(accessToken);
        return {
            userId: verifiedClaims.userId,
            appId: verifiedClaims.appId,
            sessionId: verifiedClaims.sessionId,
            issuer: verifiedClaims.issuer,
            issuedAt: verifiedClaims.issuedAt,
            expiration: verifiedClaims.expiration,
        };
    }
    catch (error) {
        console.error("Privy token verification failed:", error);
        return null;
    }
}
/**
 * Get user data from Privy by their DID
 * Useful for fetching linked wallets
 */
export async function getPrivyUser(userId) {
    try {
        const user = await privyClient.getUser(userId);
        return user;
    }
    catch (error) {
        console.error("Failed to get Privy user:", error);
        return null;
    }
}
/**
 * Extract the primary wallet address from a Privy user
 */
export function getPrimaryWallet(user) {
    if (!user)
        return null;
    // Check for linked wallets
    const linkedWallet = user.linkedAccounts.find((account) => account.type === "wallet");
    if (linkedWallet && "address" in linkedWallet) {
        return linkedWallet.address;
    }
    // Check for embedded wallet
    if (user.wallet?.address) {
        return user.wallet.address;
    }
    return null;
}
