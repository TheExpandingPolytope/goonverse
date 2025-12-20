# Funds Service Startup Flow

## Goal

Describe the minimal **Funds Service** execution flow on **startup only**.

## Startup steps (Stateless / MongoDB)

1. **Load config** from env (port, chain ID, fees).
2. **Load custody keys** from KMS or env (into memory for signing).
3. **Connect to MongoDB**.
4. **Ensure Indexes** (idempotent):
   - `deposits`: unique `depositId`
   - `accounts`: unique `(serverId, ownerId, kind)`
   - `idempotency`: unique `key`
   - `servers`: unique `serverId`
   - `server_auth`: unique `authAddress`
5. **Start Background Workers**:
   - **Indexer Loop**: polls chain for deposits to addresses found in `db.servers`.
   - **Withdrawal Queue**: polls `db.withdrawals` for `status: 'pending_broadcast'`.
6. **Start HTTP API** (ready for `registerServer` / `withdraw` / `transfer` / `deposit` calls).

## Notes

- **No state loading**: The service reads `servers`, `accounts`, and `acls` from MongoDB on demand.
- **Dynamic Registry**: New servers added via `registerServer` are immediately visible to the Indexer loop on its next poll.
- **Lazy/Transactional Creation**: Core accounts (`World`, `Ecosystem`) are created transactionally during `registerServer`, not on startup.
