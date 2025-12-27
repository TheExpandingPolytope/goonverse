## Redis-First Accounts Design (Shared Library Architecture)

**Status**: Draft  
**Owner**: goonverse  
**Scope**: `packages/indexer` + `packages/server` sharing a **Redis State** via a **Shared Library**.

---

### 0) Why this doc exists

The previous design proposed an **HTTP API** over Postgres. While robust, it introduces latency that requires complex async/batching logic for a real-time game server.

**New Direction**: We will use **Redis as the primary ledger** for all hot accounts.
- **Speed**: Redis operations are sub-millisecond, allowing the game server to interact synchronously (or near-synchronously) without stalling the loop.
- **Shared Access**: Both the **Indexer** (writing deposits) and the **Game Server** (spending funds) will connect to the **same Redis instance**.
- **Shared Library**: Logic for `deposit`, `withdraw`, `transfer` will be encapsulated in a shared library (e.g., `packages/libraries/accounts`) imported by both services.

---

### 1) Architecture

#### 1.1 Components

- **Redis (The Ledger)**
  - Stores all balances (`user:0x...`, `budget:pellets`, `server:bankroll`).
  - Configured with **AOF (Append Only File)** persistence (fsync every second or stricter) to ensure durability.

- **Shared Library (`packages/libraries/accounts`)**
  - Contains all business logic and Redis Lua scripts.
  - Exposes typed functions: `deposit()`, `withdraw()`, `transfer()`, `getBalance()`.
  - Ensures atomicity via Lua.
  - **No HTTP**. Just direct Redis calls.

- **Indexer (Writer)**
  - Listens to chain events.
  - Uses Shared Library to **credit** deposits into Redis.
  - Uses Shared Library to **debit** exits from Redis.

- **Game Server (Reader/Spender)**
  - Uses Shared Library to **check balance** for spawn eligibility.
  - Uses Shared Library to **transfer** funds on spawn.
  - Uses Shared Library to **spend/recycle** pellet budget (fast enough to do per-tick or small batches).

#### 1.2 Comparison

| Feature | HTTP API (Old) | **Redis Shared Lib (New)** |
| :--- | :--- | :--- |
| **Latency** | 10ms - 100ms+ | < 1ms |
| **Throughput** | Limited by Web Server | Redis limits (100k+ ops/sec) |
| **Complexity** | High (Async/Leasing needed) | **Low** (Direct calls) |
| **Consistency** | Strong (Postgres) | **Strong** (Redis AOF) |
| **Integration** | HTTP Client | Shared Code |

---

### 2) Data Model (Redis Keys)

We use a structured key scheme in Redis. All values are **Strings** (representing int64 wei).

- **Prefix**: `acc:{serverId}:`

#### 2.1 Account Keys
- `acc:{serverId}:user:{wallet}` -> `balanceWei`
- `acc:{serverId}:budget:pellets` -> `balanceWei`
- `acc:{serverId}:server:bankroll` -> `balanceWei`
- `acc:{serverId}:server:exit_reserved` -> `balanceWei`
- `acc:{serverId}:server:world_pool` -> `balanceWei`

#### 2.2 Idempotency Keys
To prevent double-counting events (like Indexer replays), we store processed IDs.
- `idemp:{depositId}` -> `1` (with expiration, e.g., 7 days)

---

### 3) Shared Library API

The library wraps Redis commands. All mutations use **Lua scripts** to ensure atomicity (check balance + update in one step).

```typescript
// packages/libraries/accounts/src/index.ts

export class AccountManager {
  constructor(redis: RedisClient, serverId: string);

  // Atomic: Balance += amount
  // Returns: newBalance
  async deposit(account: string, amountWei: bigint, idempotencyKey?: string): Promise<bigint>;

  // Atomic: If Balance >= amount { Balance -= amount; return true } else { return false }
  async withdraw(account: string, amountWei: bigint, idempotencyKey?: string): Promise<boolean>;

  // Atomic: If From >= amount { From -= amount; To += amount; return true } else { return false }
  async transfer(from: string, to: string, amountWei: bigint, idempotencyKey?: string): Promise<boolean>;

  // Read
  async getBalance(account: string): Promise<bigint>;
}
```

---

### 4) Flows

#### 4.1 Deposit (Indexer -> Redis)
1.  Indexer sees `Deposit` event (txHash).
2.  Indexer calls `accounts.deposit("user:" + wallet, amount, txHash)`.
3.  Indexer calls `accounts.deposit("budget:pellets", worldAmount, txHash)`.
4.  Library Lua script checks `EXISTS(idemp:{txHash})`. If yes, no-op. If no, update balance + set idemp.

#### 4.2 Spawn (Server -> Redis)
1.  User requests join.
2.  Server calls `accounts.transfer("user:" + wallet, "server:world_pool", spawnCost)`.
3.  If returns `true`: Spawn player.
4.  If returns `false`: Reject join (Insufficient funds).

#### 4.3 Pellets (Server -> Redis)
1.  Server tick needs to spawn pellets. Cost = `X`.
2.  Server calls `accounts.withdraw("budget:pellets", X)`.
3.  If `true`: Spawn pellets.
4.  If `false`: Skip spawn (Budget empty).
    *   *Note*: Since this is <1ms, we can do this every tick or every second without complex leasing.

#### 4.4 Exit (Server -> Redis)
1.  User requests exit. Payout = `Y`.
2.  Server calls `accounts.transfer("server:world_pool", "user:" + wallet, Y)`. (Credit earnings).
3.  Server calls `accounts.withdraw("user:" + wallet, Y)`. (Burn for ticket).
4.  Server signs exit ticket.

#### 4.5 On-Chain Exit (Indexer -> Redis)
1.  Indexer sees `Exit` event.
2.  Indexer calls `accounts.withdraw("server:bankroll", payout, txHash)`.
    *   *Note*: This keeps the "Observed Bankroll" in sync with chain.

---

### 5) Migration & Safety

#### 5.1 Persistence
- **Requirement**: Redis must use **AOF (Append Only File)** with `appendfsync everysec` (default) or `always`.
- **Backup**: Regular RDB snapshots to S3/Disk.
- **Recovery**: On restart, Redis reloads state from disk.

#### 5.2 Reconciliation
- We should write a script that compares:
  - Sum of all Redis accounts
  - vs.
  - Sum of all Postgres `deposits` - `exits`.
- This detects logic bugs or data loss.

---

### 6) Implementation Plan

1.  **Create Library**: `packages/libraries/accounts`.
2.  **Implement Lua**: Write the atomic scripts for deposit/withdraw/transfer.
3.  **Update Indexer**: Import lib, write to Redis on events.
4.  **Update Server**: Import lib, use for spawn/pellets/exit.
5.  **Decommission**: Remove old `balance.ts` and `depositTracker.ts` (the library replaces them).

---

### 7) Security & Isolation

We must ensure game servers can only touch their own accounts.

#### 7.1 Code-Level Isolation (Shared Library)
The `AccountManager` class enforces scoping by design.

```typescript
const accounts = new AccountManager(redis, "server_123");
// internal: keys are automatically prefixed with "acc:server_123:"
```

- The caller *cannot* specify the prefix manually.
- This prevents `server_A` from accidentally (or maliciously via library usage) writing to `server_B`.

#### 7.2 Network Isolation
- Redis is not exposed publicly.
- Only trusted services (Indexer, Game Servers) in the private network/VPC can connect.

#### 7.3 Redis ACLs (Defense in Depth)
For stricter security (e.g. if we run untrusted server code), we can use Redis 6+ ACLs to enforce key patterns at the database level.

- Create a Redis user per server:
  `user server_123 on >password ~acc:server_123:* +@all`
- This ensures that even if the server runs raw Redis commands (bypassing the library), it is rejected by Redis if it tries to touch another server's keys.




