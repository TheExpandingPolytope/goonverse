import { config } from "../config.js";
/**
 * GraphQL query helper
 */
async function graphqlQuery(query, variables) {
    const response = await fetch(`${config.ponderUrl}/graphql`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
        throw new Error(`Ponder GraphQL request failed: ${response.status} ${response.statusText}`);
    }
    const result = await response.json();
    if (result.errors?.length) {
        throw new Error(`Ponder GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`);
    }
    if (!result.data) {
        throw new Error("Ponder GraphQL returned no data");
    }
    return result.data;
}
/**
 * Get a deposit by its ID
 */
export async function getDeposit(depositId) {
    const query = `
    query GetDeposit($id: String!) {
      deposits(id: $id) {
        id
        serverId
        player
        amount
        spawnAmount
        worldAmount
        rakeAmount
        blockNumber
        timestamp
        txHash
      }
    }
  `;
    try {
        const data = await graphqlQuery(query, { id: depositId });
        return data.deposits ? normalizeDeposit(data.deposits) : null;
    }
    catch (error) {
        console.error("Failed to get deposit:", error);
        return null;
    }
}
/**
 * Get deposits for a player on a specific server
 */
export async function getPlayerDeposits(serverId, player) {
    // Convert serverId to bytes32 hex for the indexer (accepts either bytes32 hex or human-readable ids).
    const serverIdHex = serverIdToBytes32(serverId);
    const query = `
    query GetPlayerDeposits($serverId: String!, $player: String!) {
      depositss(
        where: { serverId: $serverId, player: $player }
        orderBy: "timestamp"
        orderDirection: "desc"
      ) {
        items {
          id
          serverId
          player
          amount
          spawnAmount
          worldAmount
          rakeAmount
          blockNumber
          timestamp
          txHash
        }
      }
    }
  `;
    try {
        const data = await graphqlQuery(query, {
            serverId: serverIdHex,
            player: player.toLowerCase(),
        });
        return data.depositss.items.map(normalizeDeposit);
    }
    catch (error) {
        console.error("Failed to get player deposits:", error);
        return [];
    }
}
/**
 * Get exits for a player on a specific server
 */
export async function getPlayerExits(serverId, player) {
    // Convert serverId to bytes32 hex for the indexer (accepts either bytes32 hex or human-readable ids).
    const serverIdHex = serverIdToBytes32(serverId);
    const query = `
    query GetPlayerExits($serverId: String!, $player: String!) {
      exitss(
        where: { serverId: $serverId, player: $player }
        orderBy: "timestamp"
        orderDirection: "desc"
      ) {
        items {
          id
          serverId
          sessionId
          player
          payout
          blockNumber
          timestamp
          txHash
        }
      }
    }
  `;
    try {
        const data = await graphqlQuery(query, {
            serverId: serverIdHex,
            player: player.toLowerCase(),
        });
        return data.exitss.items;
    }
    catch (error) {
        console.error("Failed to get player exits:", error);
        return [];
    }
}
/**
 * Verify a deposit exists and is valid for joining
 *
 * @param serverId - The server ID
 * @param depositId - The deposit ID
 * @param player - The player's wallet address
 * @returns The deposit if valid, null otherwise
 */
export async function verifyDeposit(serverId, depositId, player) {
    // Convert serverId to bytes32 hex for comparison with indexer data.
    const serverIdHex = serverIdToBytes32(serverId);
    const deposit = await getDeposit(depositId);
    if (!deposit) {
        console.log(`Deposit ${depositId} not found`);
        return null;
    }
    // Verify server ID matches
    if (deposit.serverId.toLowerCase() !== serverIdHex.toLowerCase()) {
        console.log(`Deposit ${depositId} is for server ${deposit.serverId}, not ${serverIdHex} (requested ${serverId})`);
        return null;
    }
    // Verify player matches
    if (deposit.player.toLowerCase() !== player.toLowerCase()) {
        console.log(`Deposit ${depositId} is for player ${deposit.player}, not ${player}`);
        return null;
    }
    return deposit;
}
/**
 * Convert a serverId into bytes32 hex format for indexing/contract usage.
 *
 * - If `serverId` already starts with `0x`, we treat it as hex and right-pad it to 32 bytes.
 * - Otherwise we encode it as UTF-8 and right-pad it to 32 bytes.
 */
export function serverIdToBytes32(serverId) {
    if (serverId.startsWith("0x")) {
        const hex = serverId.slice(2);
        if (hex.length > 64) {
            throw new Error(`serverId hex too long: ${serverId}`);
        }
        return (`0x${hex.padEnd(64, "0")}`);
    }
    const hex = Buffer.from(serverId, "utf8").toString("hex");
    return (`0x${hex.padEnd(64, "0")}`);
}
/**
 * Get server configuration from the indexer
 */
export async function getServer(serverId) {
    // Convert serverId to bytes32 hex format
    const serverIdHex = serverIdToBytes32(serverId);
    const query = `
    query GetServer($id: String!) {
      servers(id: $id) {
        id
        controller
        buyInAmount
        massPerEth
        rakeShareBps
        worldShareBps
        exitHoldMs
        isActive
      }
    }
  `;
    try {
        const data = await graphqlQuery(query, { id: serverIdHex });
        return data.servers ?? null;
    }
    catch (error) {
        console.error("Failed to get server:", error);
        return null;
    }
}
function normalizeDeposit(raw) {
    return {
        ...raw,
        amount: BigInt(raw.amount ?? 0n),
        spawnAmount: BigInt(raw.spawnAmount ?? 0n),
        worldAmount: BigInt(raw.worldAmount ?? 0n),
        rakeAmount: BigInt(raw.rakeAmount ?? 0n),
        blockNumber: BigInt(raw.blockNumber ?? 0n),
        timestamp: BigInt(raw.timestamp ?? 0n),
    };
}
