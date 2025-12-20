export type AccountId = {
    serverId: string;
    kind: "PelletReserve";
} | {
    serverId: string;
    kind: "BankrollObserved";
} | {
    serverId: string;
    kind: "ExitReservedTotal";
};
export declare function addAccount(_account: AccountId): Promise<void>;
export declare function deposit(account: AccountId, amountWei: bigint): Promise<void>;
export declare function withdraw(account: AccountId, amountWei: bigint): Promise<boolean>;
export declare function transfer(from: AccountId, to: AccountId, amountWei: bigint): Promise<boolean>;
export declare function getPelletReserveWei(serverId: string): Promise<bigint>;
export declare function getObservedBankrollWei(serverId: string): Promise<bigint>;
export declare function getReservedExitLiquidityWei(serverId: string): Promise<bigint>;
export type DepositBalanceInput = {
    id: string;
    serverId: string;
    spawnAmountWei: bigint;
    worldAmountWei: bigint;
};
/**
 * Ensure a deposit's balances are applied exactly once.
 *
 * Safe to call on the join path to avoid races with background sync.
 */
export declare function applyDepositToBalances(input: DepositBalanceInput): Promise<boolean>;
export declare function creditPelletReserveWei(serverId: string, amountWei: bigint): Promise<void>;
export declare function trySpendPelletReserveWei(serverId: string, amountWei: bigint): Promise<boolean>;
export declare function reserveExitLiquidityWei(params: {
    serverId: string;
    sessionId: string;
    payoutWei: bigint;
    ttlSeconds: number;
}): Promise<boolean>;
export declare function releaseExitReservation(serverId: string, sessionId: string): Promise<boolean>;
export declare function isDepositUsed(serverId: string, depositId: string): Promise<boolean>;
export declare function tryUseDeposit(serverId: string, depositId: string): Promise<boolean>;
/**
 * Background sync that ensures pellet reserve increases for EVERY deposit (worldAmount),
 * regardless of whether the depositor ever joins a room.
 *
 * It also tracks an observed on-chain bankroll (spawnAmount + worldAmount - exits).
 */
export declare function startAccountingSync(options?: {
    serverId?: string;
    pollIntervalMs?: number;
    pageSize?: number;
}): () => void;
