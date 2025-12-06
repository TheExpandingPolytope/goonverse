import { config } from "../config.js";

/**
 * Deposit data from the Ponder indexer
 */
export interface Deposit {
  id: `0x${string}`;
  serverId: `0x${string}`;
  player: `0x${string}`;
  amount: bigint;
  spawnAmount: bigint;
  worldAmount: bigint;
  rakeAmount: bigint;
  blockNumber: bigint;
  timestamp: bigint;
  txHash: `0x${string}`;
}

/**
 * Exit data from the Ponder indexer
 */
export interface Exit {
  id: string;
  serverId: `0x${string}`;
  sessionId: `0x${string}`;
  player: `0x${string}`;
  payout: bigint;
  blockNumber: bigint;
  timestamp: bigint;
  txHash: `0x${string}`;
}

/**
 * GraphQL query helper
 */
async function graphqlQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
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

  const result = await response.json() as { data?: T; errors?: Array<{ message: string }> };

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
export async function getDeposit(depositId: `0x${string}`): Promise<Deposit | null> {
  const query = `
    query GetDeposit($id: String!) {
      deposit(id: $id) {
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
    const data = await graphqlQuery<{ deposit: Deposit | null }>(query, { id: depositId });
    return data.deposit;
  } catch (error) {
    console.error("Failed to get deposit:", error);
    return null;
  }
}

/**
 * Get deposits for a player on a specific server
 */
export async function getPlayerDeposits(
  serverId: `0x${string}`,
  player: `0x${string}`
): Promise<Deposit[]> {
  const query = `
    query GetPlayerDeposits($serverId: String!, $player: String!) {
      deposits(
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
    const data = await graphqlQuery<{ deposits: { items: Deposit[] } }>(query, {
      serverId,
      player: player.toLowerCase(),
    });
    return data.deposits.items;
  } catch (error) {
    console.error("Failed to get player deposits:", error);
    return [];
  }
}

/**
 * Get exits for a player on a specific server
 */
export async function getPlayerExits(
  serverId: `0x${string}`,
  player: `0x${string}`
): Promise<Exit[]> {
  const query = `
    query GetPlayerExits($serverId: String!, $player: String!) {
      exits(
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
    const data = await graphqlQuery<{ exits: { items: Exit[] } }>(query, {
      serverId,
      player: player.toLowerCase(),
    });
    return data.exits.items;
  } catch (error) {
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
export async function verifyDeposit(
  serverId: `0x${string}`,
  depositId: `0x${string}`,
  player: `0x${string}`
): Promise<Deposit | null> {
  const deposit = await getDeposit(depositId);

  if (!deposit) {
    console.log(`Deposit ${depositId} not found`);
    return null;
  }

  // Verify server ID matches
  if (deposit.serverId.toLowerCase() !== serverId.toLowerCase()) {
    console.log(`Deposit ${depositId} is for server ${deposit.serverId}, not ${serverId}`);
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
 * Get server configuration from the indexer
 */
export async function getServer(serverId: `0x${string}`) {
  const query = `
    query GetServer($id: String!) {
      server(id: $id) {
        id
        controller
        buyInAmount
        massPerDollar
        rakeShareBps
        worldShareBps
        exitHoldMs
        isActive
      }
    }
  `;

  try {
    const data = await graphqlQuery<{
      server: {
        id: `0x${string}`;
        controller: `0x${string}`;
        buyInAmount: string;
        massPerDollar: number;
        rakeShareBps: number;
        worldShareBps: number;
        exitHoldMs: number;
        isActive: boolean;
      } | null;
    }>(query, { id: serverId });

    return data.server;
  } catch (error) {
    console.error("Failed to get server:", error);
    return null;
  }
}

