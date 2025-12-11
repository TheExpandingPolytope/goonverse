import { onchainTable, index } from "ponder";

/**
 * Server registry - tracks game servers registered on-chain
 * Populated by AddedServer, UpdatedServer, RemovedServer events
 */
export const servers = onchainTable(
  "servers",
  (t) => ({
    // Primary key: bytes32 serverId from contract
    id: t.hex().primaryKey(),
    // Server controller address (signs exit tickets)
    controller: t.hex().notNull(),
    // Buy-in amount in asset tokens (e.g., USDC with 6 decimals)
    buyInAmount: t.bigint().notNull(),
    // Mass per ETH conversion rate
    massPerEth: t.integer().notNull(),
    // Rake share in basis points (10000 = 100%)
    rakeShareBps: t.integer().notNull(),
    // World pool share in basis points
    worldShareBps: t.integer().notNull(),
    // Exit hold duration in milliseconds
    exitHoldMs: t.integer().notNull(),
    // Whether server is active (false after RemovedServer)
    isActive: t.boolean().notNull().default(true),
    // Block number when server was added
    createdAtBlock: t.bigint().notNull(),
    // Timestamp when server was added
    createdAt: t.bigint().notNull(),
    // Block number of last update
    updatedAtBlock: t.bigint().notNull(),
    // Timestamp of last update
    updatedAt: t.bigint().notNull(),
  }),
  (table) => ({
    controllerIdx: index().on(table.controller),
    isActiveIdx: index().on(table.isActive),
  })
);

/**
 * Player deposits - tracks all deposits into game servers
 * Populated by Deposit events
 */
export const deposits = onchainTable(
  "deposits",
  (t) => ({
    // Primary key: bytes32 depositId from contract
    id: t.hex().primaryKey(),
    // Server this deposit is for
    serverId: t.hex().notNull(),
    // Player address
    player: t.hex().notNull(),
    // Total amount deposited
    amount: t.bigint().notNull(),
    // Amount credited to player's spawn budget (after fees)
    spawnAmount: t.bigint().notNull(),
    // Amount sent to world pool
    worldAmount: t.bigint().notNull(),
    // Amount sent to rake recipient
    rakeAmount: t.bigint().notNull(),
    // Block number of deposit
    blockNumber: t.bigint().notNull(),
    // Timestamp of deposit
    timestamp: t.bigint().notNull(),
    // Transaction hash
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    serverIdx: index().on(table.serverId),
    playerIdx: index().on(table.player),
    playerServerIdx: index().on(table.player, table.serverId),
  })
);

/**
 * Player exits - tracks all cashouts from game servers
 * Populated by Exit events
 */
export const exits = onchainTable(
  "exits",
  (t) => ({
    // Primary key: txHash-logIndex composite
    id: t.text().primaryKey(),
    // Server this exit is from
    serverId: t.hex().notNull(),
    // Session ID (unique per game session)
    sessionId: t.hex().notNull(),
    // Player address
    player: t.hex().notNull(),
    // Payout amount
    payout: t.bigint().notNull(),
    // Block number of exit
    blockNumber: t.bigint().notNull(),
    // Timestamp of exit
    timestamp: t.bigint().notNull(),
    // Transaction hash
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    serverIdx: index().on(table.serverId),
    playerIdx: index().on(table.player),
    sessionIdx: index().on(table.sessionId),
    playerServerIdx: index().on(table.player, table.serverId),
  })
);
