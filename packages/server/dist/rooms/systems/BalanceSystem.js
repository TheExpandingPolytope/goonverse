/**
 * Balance System
 *
 * Manages the world's token balance.
 * - Tracks total available funds for spawning pellets
 * - Handles deposits (when players join) and withdrawals (when players exit)
 * - Ensures the server remains solvent
 */
export class BalanceSystem {
    constructor(serverId, massPerEth, decimals = 18) {
        this.peakBalance = 0n;
        this.warnThresholdRatio = 0.1;
        this.serverId = serverId;
        this.massPerEth = massPerEth;
        this.decimals = decimals;
    }
    setMassPerEth(next) {
        this.massPerEth = next;
    }
    /**
     * Initialize or reset the known world balance.
     */
    initialize(state, initialBalance) {
        this.setBalance(state, initialBalance);
        if (initialBalance > this.peakBalance) {
            this.peakBalance = initialBalance;
        }
    }
    /**
     * Current on-chain derived balance (in smallest token units, e.g. wei 18dp).
     */
    getBalance(state) {
        return BigInt(state.worldBalance ?? "0");
    }
    /**
     * Add funds to the world balance (e.g., from new deposits or reclaimed pellets).
     */
    credit(state, amount) {
        if (amount <= 0n) {
            return this.getBalance(state);
        }
        const next = this.getBalance(state) + amount;
        this.setBalance(state, next);
        if (next > this.peakBalance) {
            this.peakBalance = next;
        }
        this.logIfLow(next, "credit");
        return next;
    }
    /**
     * Attempt to remove funds from the world balance.
     * Returns true if successful, false if insufficient.
     */
    debit(state, amount) {
        if (amount <= 0n) {
            return true;
        }
        const current = this.getBalance(state);
        if (current < amount) {
            return false;
        }
        const next = current - amount;
        this.setBalance(state, next);
        this.logIfLow(next, "debit");
        return true;
    }
    /**
     * Spend balance to spawn pellets. Returns true if the pellet can be spawned.
     */
    spendForPellet(state, pelletMass) {
        const cost = this.massToPayoutAmount(pelletMass);
        return this.debit(state, cost);
    }
    /**
     * Whether enough balance exists to cover an upcoming debit.
     */
    hasSufficientBalance(state, amount) {
        return this.getBalance(state) >= amount;
    }
    setBalance(state, next) {
        state.worldBalance = next.toString();
    }
    logIfLow(nextBalance, reason) {
        if (this.peakBalance === 0n) {
            return;
        }
        const scaledRatio = Number((nextBalance * 10000n) / this.peakBalance) / 100; // percentage with 2 decimals
        if (scaledRatio <= this.warnThresholdRatio * 100) {
            console.warn(`[BalanceSystem] Server ${this.serverId} low balance after ${reason}: ${nextBalance.toString()} (${scaledRatio.toFixed(2)}% of peak)`);
        }
    }
    massToPayoutAmount(mass) {
        const payoutUsd = mass / this.massPerEth;
        const factor = 10 ** this.decimals;
        return BigInt(Math.floor(payoutUsd * factor));
    }
}
