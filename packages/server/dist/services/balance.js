// Legacy compat layer.
//
// The codebase historically used `services/balance.ts` as the entrypoint for economic state.
// We keep this file so older imports keep working, but the implementation now lives in
// `services/accounting.ts` (Node-only, no Lua scripts).
export { applyDepositToBalances, creditPelletReserveWei, getObservedBankrollWei, getPelletReserveWei, getReservedExitLiquidityWei, releaseExitReservation, reserveExitLiquidityWei, startAccountingSync as startBalanceSync, trySpendPelletReserveWei, } from "./accounting.js";
