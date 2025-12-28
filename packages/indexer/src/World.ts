import { ponder } from "ponder:registry";
import { servers, deposits, exits } from "ponder:schema";
import Redis from "ioredis";
import { AccountManager } from "@goonverse/accounts";

const redisUri = process.env.REDIS_URL || process.env.REDIS_URI || "redis://localhost:6379";
const redis = new Redis(redisUri, {
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
});

const accounts = new AccountManager(redis);

/**
 * Handle AddedServer event - create new server entry
 */
ponder.on("World:AddedServer", async ({ event, context }) => {
  const args = event.args as any;
  const {
    serverId,
    controller,
    buyInAmount,
    massPerEth,
    exitHoldMs,
  }: {
    serverId: `0x${string}`;
    controller: `0x${string}`;
    buyInAmount: bigint;
    massPerEth: number;
    exitHoldMs: number;
  } = args;

  // Back-compat: older ABI names used developerFeeBps/worldFeeBps.
  const rakeShareBps: number = Number(args.rakeShareBps ?? args.developerFeeBps);
  const worldShareBps: number = Number(args.worldShareBps ?? args.worldFeeBps);

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
  const args = event.args as any;
  const {
    serverId,
    controller,
    buyInAmount,
    massPerEth,
    exitHoldMs,
  }: {
    serverId: `0x${string}`;
    controller: `0x${string}`;
    buyInAmount: bigint;
    massPerEth: number;
    exitHoldMs: number;
  } = args;

  const rakeShareBps: number = Number(args.rakeShareBps ?? args.developerFeeBps);
  const worldShareBps: number = Number(args.worldShareBps ?? args.worldFeeBps);

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
 * 
 * Credits:
 * - user:pending:spawn:<wallet> with spawnAmount (player's spawnable balance)
 * - server:budget with worldAmount (pellet spawning budget)
 * - server:total with spawnAmount + worldAmount (total bankroll)
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

  // Hot-ledger updates (Redis), idempotent per depositId.
  const wallet = (player as `0x${string}`).toLowerCase();
  const spawn = spawnAmount as bigint;
  const world = worldAmount as bigint;
  const totalBankrollCredit = spawn + world;

  await Promise.all([
    accounts.deposit(serverId, `user:pending:spawn:${wallet}`, spawn, `deposit:spawn:${depositId}`),
    accounts.deposit(serverId, "server:budget", world, `deposit:budget:${depositId}`),
    accounts.deposit(serverId, "server:total", totalBankrollCredit, `deposit:total:${depositId}`),
  ]);
});

/**
 * Handle Exit event - record player cashout
 * 
 * Burns:
 * - user:pending:exit:<wallet> by payout (user claimed their pending exit)
 * - server:total by payout (reflects on-chain bankroll reduction)
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

  // Hot-ledger updates (Redis), idempotent per sessionId.
  const wallet = (player as `0x${string}`).toLowerCase();
  const amount = payout as bigint;
  const sid = sessionId as `0x${string}`;

  await Promise.all([
    // Burn user's pending exit balance (they've claimed it on-chain)
    accounts.burn(serverId, `user:pending:exit:${wallet}`, amount, `exit:pending:${sid}`),
    // Burn server total to reflect on-chain bankroll reduction
    accounts.burn(serverId, "server:total", amount, `exit:total:${sid}`),
  ]);
});
