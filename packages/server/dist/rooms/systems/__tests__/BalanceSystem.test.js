import test from "node:test";
import assert from "node:assert/strict";
import { BalanceSystem } from "../BalanceSystem.js";
import { GameState } from "../../schema/GameState.js";
const SERVER_ID = "0x0000000000000000000000000000000000000001";
test("credit and debit adjust balance", () => {
    const state = new GameState();
    const balance = new BalanceSystem(SERVER_ID, 100);
    // Seed with 1 ETH (wei)
    balance.initialize(state, 1000000000000000000n);
    assert.equal(balance.getBalance(state), 1000000000000000000n);
    balance.credit(state, 500000000000000000n);
    assert.equal(balance.getBalance(state), 1500000000000000000n);
    assert.ok(balance.hasSufficientBalance(state, 200000000000000000n));
    assert.ok(balance.debit(state, 200000000000000000n));
    assert.equal(balance.getBalance(state), 1300000000000000000n);
    assert.equal(balance.hasSufficientBalance(state, 2000000000000000000n), false);
    assert.equal(balance.debit(state, 2000000000000000000n), false);
});
test("spendForPellet uses mass to payout conversion", () => {
    const state = new GameState();
    const balance = new BalanceSystem(SERVER_ID, 100); // 100 mass per $1
    balance.initialize(state, 50000000000000000n); // 0.05 ETH worth of balance (18 decimals)
    // pellet mass 1 -> cost = 1 / 100 * 1e18 = 1e16 wei
    assert.ok(balance.spendForPellet(state, 1));
    assert.equal(balance.getBalance(state), 40000000000000000n);
    // Attempt to spend more than remaining balance by spawning huge pellet
    const success = balance.spendForPellet(state, 10_000); // cost would exceed remaining funds
    assert.equal(success, false);
    assert.equal(balance.getBalance(state), 40000000000000000n);
});
