import { GameState } from "../schema/GameState.js";
/**
 * Balance System
 *
 * Manages the world's token balance.
 * - Tracks total available funds for spawning pellets
 * - Handles deposits (when players join) and withdrawals (when players exit)
 * - Ensures the server remains solvent
 */
export declare class BalanceSystem {
    private massPerEth;
    private decimals;
    private peakBalance;
    private readonly serverId;
    private readonly warnThresholdRatio;
    constructor(serverId: `0x${string}`, massPerEth: number, decimals?: number);
    setMassPerEth(next: number): void;
    /**
     * Initialize or reset the known world balance.
     */
    initialize(state: GameState, initialBalance: bigint): void;
    /**
     * Current on-chain derived balance (in smallest token units, e.g. wei 18dp).
     */
    getBalance(state: GameState): bigint;
    /**
     * Add funds to the world balance (e.g., from new deposits or reclaimed pellets).
     */
    credit(state: GameState, amount: bigint): bigint;
    /**
     * Attempt to remove funds from the world balance.
     * Returns true if successful, false if insufficient.
     */
    debit(state: GameState, amount: bigint): boolean;
    /**
     * Spend balance to spawn pellets. Returns true if the pellet can be spawned.
     */
    spendForPellet(state: GameState, pelletMass: number): boolean;
    /**
     * Whether enough balance exists to cover an upcoming debit.
     */
    hasSufficientBalance(state: GameState, amount: bigint): boolean;
    private setBalance;
    private logIfLow;
    private massToPayoutAmount;
}
