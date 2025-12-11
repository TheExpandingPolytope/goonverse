import { GameState } from "../schema/GameState.js";
/**
 * Balance System
 * 
 * Manages the world's token balance.
 * - Tracks total available funds for spawning pellets
 * - Handles deposits (when players join) and withdrawals (when players exit)
 * - Ensures the server remains solvent
 */

export class BalanceSystem {
  private massPerEth: number;
  private decimals: number;
  private peakBalance: bigint = 0n;
  private readonly serverId: `0x${string}`;
  private readonly warnThresholdRatio = 0.1;

  constructor(serverId: `0x${string}`, massPerEth: number, decimals: number = 18) {
    this.serverId = serverId;
    this.massPerEth = massPerEth;
    this.decimals = decimals;
  }

  setMassPerEth(next: number) {
    this.massPerEth = next;
  }

  /**
   * Initialize or reset the known world balance.
   */
  initialize(state: GameState, initialBalance: bigint) {
    this.setBalance(state, initialBalance);
    if (initialBalance > this.peakBalance) {
      this.peakBalance = initialBalance;
    }
  }

  /**
   * Current on-chain derived balance (in smallest token units, e.g. wei 18dp).
   */
  getBalance(state: GameState): bigint {
    return BigInt(state.worldBalance ?? "0");
  }

  /**
   * Add funds to the world balance (e.g., from new deposits or reclaimed pellets).
   */
  credit(state: GameState, amount: bigint): bigint {
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
  debit(state: GameState, amount: bigint): boolean {
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
  spendForPellet(state: GameState, pelletMass: number): boolean {
    const cost = this.massToPayoutAmount(pelletMass);
    return this.debit(state, cost);
  }

  /**
   * Whether enough balance exists to cover an upcoming debit.
   */
  hasSufficientBalance(state: GameState, amount: bigint): boolean {
    return this.getBalance(state) >= amount;
  }

  private setBalance(state: GameState, next: bigint) {
    state.worldBalance = next.toString();
  }

  private logIfLow(nextBalance: bigint, reason: string) {
    if (this.peakBalance === 0n) {
      return;
    }
    const scaledRatio = Number((nextBalance * 10000n) / this.peakBalance) / 100; // percentage with 2 decimals
    if (scaledRatio <= this.warnThresholdRatio * 100) {
      console.warn(
        `[BalanceSystem] Server ${this.serverId} low balance after ${reason}: ${nextBalance.toString()} (${scaledRatio.toFixed(
          2
        )}% of peak)`
      );
    }
  }

  private massToPayoutAmount(mass: number): bigint {
    const payoutUsd = mass / this.massPerEth;
    const factor = 10 ** this.decimals;
    return BigInt(Math.floor(payoutUsd * factor));
  }
}

