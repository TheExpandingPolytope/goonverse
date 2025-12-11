import { ponder } from "ponder:registry";
import { servers, deposits, exits } from "ponder:schema";

/**
 * Handle AddedServer event - create new server entry
 */
ponder.on("World:AddedServer", async ({ event, context }) => {
  const { serverId, controller, buyInAmount, massPerEth, rakeShareBps, worldShareBps, exitHoldMs } = event.args;

  await context.db.insert(servers).values({
    id: serverId,
    controller: controller,
    buyInAmount: buyInAmount,
    massPerEth: massPerEth,
    rakeShareBps: rakeShareBps,
    worldShareBps: worldShareBps,
    exitHoldMs: exitHoldMs,
    isActive: true,
    createdAtBlock: event.block.number,
    createdAt: event.block.timestamp,
    updatedAtBlock: event.block.number,
    updatedAt: event.block.timestamp,
  });
});

/**
 * Handle UpdatedServer event - update existing server config
 */
ponder.on("World:UpdatedServer", async ({ event, context }) => {
  const { serverId, controller, buyInAmount, massPerEth, rakeShareBps, worldShareBps, exitHoldMs } = event.args;

  await context.db
    .update(servers, { id: serverId })
    .set({
      controller: controller,
      buyInAmount: buyInAmount,
      massPerEth: massPerEth,
      rakeShareBps: rakeShareBps,
      worldShareBps: worldShareBps,
      exitHoldMs: exitHoldMs,
      updatedAtBlock: event.block.number,
      updatedAt: event.block.timestamp,
    });
});

/**
 * Handle RemovedServer event - mark server as inactive
 */
ponder.on("World:RemovedServer", async ({ event, context }) => {
  const { serverId } = event.args;

  await context.db
    .update(servers, { id: serverId })
    .set({
      isActive: false,
      updatedAtBlock: event.block.number,
      updatedAt: event.block.timestamp,
    });
});

/**
 * Handle Deposit event - record player deposit with fee breakdown
 */
ponder.on("World:Deposit", async ({ event, context }) => {
  const { player, serverId, depositId, amount, spawnAmount, worldAmount, rakeAmount } = event.args;

  await context.db.insert(deposits).values({
    id: depositId,
    serverId: serverId,
    player: player,
    amount: amount,
    spawnAmount: spawnAmount,
    worldAmount: worldAmount,
    rakeAmount: rakeAmount,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
});

/**
 * Handle Exit event - record player cashout
 */
ponder.on("World:Exit", async ({ event, context }) => {
  const { player, serverId, sessionId, payout } = event.args;

  // Create composite ID from transaction hash and log index
  const exitId = `${event.transaction.hash}-${event.log.logIndex}`;

  await context.db.insert(exits).values({
    id: exitId,
    serverId: serverId,
    sessionId: sessionId,
    player: player,
    payout: payout,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
});

