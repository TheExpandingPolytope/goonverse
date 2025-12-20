// Legacy compat layer.
//
// Deposit usage tracking now lives in `services/accounting.ts`.
// Keep this file so older imports keep working.
export { isDepositUsed, tryUseDeposit } from "./accounting.js";
// Backwards alias
export async function markDepositUsed(serverId, depositId) {
    const { tryUseDeposit } = await import("./accounting.js");
    return await tryUseDeposit(serverId, depositId);
}
