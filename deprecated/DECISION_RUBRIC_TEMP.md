## Decision Rubric: Contract-Hybrid vs. Full Custody

Since we are moving to **full off-chain custody**, here is a summary of the trade-offs accepted.

| Feature | Contract-Hybrid (Old) | **Full Custody (New)** |
| :--- | :--- | :--- |
| **Trust Model** | Trustless-ish (rules on-chain, but admin sweep exists). | **Trusted** (operator controls all funds). |
| **Deposit Gas** | High (contract call). | **Low** (simple ETH transfer). |
| **Exit Gas** | **User pays** (claim tx). | **Operator pays** (send tx). *User pays via fees.* |
| **Throughput** | Limited by chain. | **High** (DB speed). Chain only for settle. |
| **Safety** | Contract enforces bankroll/replay. | **Ledger enforces invariants.** (Requires strict audit). |
| **Complexity** | Solidity + Indexer. | **Systems Engineering** (Ledger, Reconciliation, Hot Wallet). |
| **Compliance** | "Smart Contract" argument. | **"Custodian/Exchange"** reality. |

**Why this choice?**
- **UX**: Deposits are standard transfers (CEX-friendly). Exits are "magic" (no signing, just receiving).
- **Speed**: Gameplay and balance updates are instant DB ops.
- **Flexibility**: Can change fees, game rules, and mass specs without migration/upgrades.

