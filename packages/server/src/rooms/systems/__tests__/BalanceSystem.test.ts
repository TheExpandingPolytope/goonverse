import test from "node:test";
import assert from "node:assert/strict";
import { BalanceSystem } from "../BalanceSystem.js";
import { GameState } from "../../schema/GameState.js";

const SERVER_ID = "0x0000000000000000000000000000000000000001" as const;

test("credit and debit adjust balance", () => {
  const state = new GameState();
  const balance = new BalanceSystem(SERVER_ID, 100);
  // Seed with 1 ETH (wei)
  balance.initialize(state, 1_000_000_000_000_000_000n);

  assert.equal(balance.getBalance(state), 1_000_000_000_000_000_000n);

  balance.credit(state, 500_000_000_000_000_000n);
  assert.equal(balance.getBalance(state), 1_500_000_000_000_000_000n);

  assert.ok(balance.hasSufficientBalance(state, 200_000_000_000_000_000n));
  assert.ok(balance.debit(state, 200_000_000_000_000_000n));
  assert.equal(balance.getBalance(state), 1_300_000_000_000_000_000n);

  assert.equal(balance.hasSufficientBalance(state, 2_000_000_000_000_000_000n), false);
  assert.equal(balance.debit(state, 2_000_000_000_000_000_000n), false);
});

test("spendForPellet uses mass to payout conversion", () => {
  const state = new GameState();
  const balance = new BalanceSystem(SERVER_ID, 100); // 100 mass per $1
  balance.initialize(state, 50_000_000_000_000_000n); // 0.05 ETH worth of balance (18 decimals)

  // pellet mass 1 -> cost = 1 / 100 * 1e18 = 1e16 wei
  assert.ok(balance.spendForPellet(state, 1));
  assert.equal(balance.getBalance(state), 40_000_000_000_000_000n);

  // Attempt to spend more than remaining balance by spawning huge pellet
  const success = balance.spendForPellet(state, 10_000); // cost would exceed remaining funds
  assert.equal(success, false);
  assert.equal(balance.getBalance(state), 40_000_000_000_000_000n);
});
