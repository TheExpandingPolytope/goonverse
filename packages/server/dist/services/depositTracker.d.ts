export { isDepositUsed, tryUseDeposit } from "./accounting.js";
export declare function markDepositUsed(serverId: string, depositId: string): Promise<boolean>;
