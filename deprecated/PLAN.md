# globs.fun – Game & Protocol Specification  
_Agar.io-style real-money arena with minimal on-chain state_

> **Note (Gameplay Parity):** We are aligning core gameplay mechanics to **Ogar3 FFA**.  
> See `OGAR3_FFA_GAMEPLAY_PARITY_PLAN.md` for the authoritative parity plan and implementation breakdown.

---

## 0. Scope & Design Goals

globs.fun is a **real-time Agar.io-like game** where:

- Players **deposit ETH** to join a round.
- Deposits are converted into **in-game mass** via a fixed **Mass-Per-Dollar (MPD)** rate (we keep the MPD terminology for economy tuning even though settlement is in ETH).
- Players grow by **eating pellets** and **consuming smaller players**.
- At the end of the round, each player’s **final mass** is converted back into ETH.
- Each server maintains its own contract and worldPool balance for the spawning of pellets.

Key constraints:

- **Minimal on-chain state**:  
  The chain doesn’t care about per-tick game details.  
  It sees:
  - deposits
  - a fixed MPD for the lobby
  - a rake parameter (how much is taken at the end of the round for the developer)
  - claimable amounts for each player

- **Everything in-game is mass**.  
  ETH is only used at the boundaries:
  - deposit → mass
  - mass → payout (claimable)

- **Non-custodial**, **skill-based**, **server-authoritative**:
  - Privy wallets (user custody)
  - Base chain
  - Paymaster (no ETH needed)
  - Colyseus authoritative server

---

## 1. Core Concepts & Definitions

### 1.1 Player

- Identified by:
  - Wallet address on Base
  - Connection ID on game server
- A player controls one or more **blobs** (cells) in the arena.

### 1.2 Lobby (Tier)

A **lobby** is a set of games with:

- A **base buy-in** `B` (in ETH)
- A **target starting mass** `M_base` (mass units)
- A **fixed Mass-Per-Dollar** `MPD` for all rounds in that lobby
- A **rake** rate. Percentage of the total payout that is taken for the developer (at the end of each round)
- A round length, pellet spawn rate, etc.

### 1.3 Mass

- The **only in-game currency**.
- Blobs, pellets, and any other entities all express value in **mass units**.
- Blob radius ∝ sqrt(mass), speed decreases as mass increases.

### 1.4 MPD (Mass-Per-Dollar)

For a lobby:

```text
MPD = M_base / B
```

- `B` = base buy-in (ETH)
- `M_base` = desired starting mass for a player depositing exactly `B`

Conversion:

```text
mass = ETH * MPD
ETH = mass / MPD
```

This rate is **fixed per lobby** and does not change per round.

### 1.5 worldPool

- The **worldPool** is the amount of ETH maintained by the server to fund pellet spawning and (potentially) other rewards down the line.
- Conceptually backs:
  - Ensures pellets exist for every time a player joins at the very least. (when they deposit to spawn, portion goes to worldPool)
  - Any "extra" game value not paid out to players
- Evolves implicitly:
  - **Increases** When a player joins a round (take a portion of the deposit and add to worldPool)
  - **Decreases** when the server "uses" worldPool value to fund pellet mass in a round. (when pellets are spawned)
  - **Increases** When un-eaten pellets remain at the end of a round. (added back into the worldPool)

### 1.7 Pellets

- Small static entities with **mass** (e.g. `PELLET_MASS = 1`).
- Eating a pellet:
  - Increases blob mass by `PELLET_MASS`.
- Total pellet mass in a round is ultimately backed by USDC from:
  - New deposits that round
  - Existing worldPool

---

## 2. High-Level System Architecture

**Actors & Components:**

- **Client** (browser / app)
  - Handles input, rendering, basic prediction.
- **Authoritative Game Server** (Colyseus)
  - Full game simulation
  - Pellets, collisions, kills
  - Round management
- **Smart Contract** (per lobby/server instance)
  - Holds USDC (deposits + implicit worldPool)
  - Verifies and records round results
  - Tracks claimable payouts
- **Wallet & Auth**
  - Privy for auth + wallet management
  - Base network
  - Paymaster for gas abstraction

---

## 3. Gameplay Design

### 3.1 Movement

- Controls: mouse / touch drag to set target direction.
- Server updates per tick (e.g. 20–30 Hz):
  - Acceleration toward input direction.
  - Speed is a decreasing function of mass, e.g.:

    ```text
    v(mass) = v_min + (v_max - v_min) * (1 / (1 + k * mass))
    ```

- Client may do simple local prediction; server is always authoritative.

### 3.2 Blob Size & Radius

- Mass `m` → radius `r`:

  ```text
  r = c * sqrt(m)
  ```

  where `c` is a scaling constant.

- Larger mass:
  - Larger area
  - Slower movement

### 3.3 Collision & Eating

Two blobs A and B (same or different players):

- Radii: `rA`, `rB`
- Distance between centers: `d`

**Eat condition (A eats B):**

- `massA > massB * EAT_THRESHOLD` (e.g. `EAT_THRESHOLD = 1.1`)
- `d < rA - rB * marginFactor` (ensures full engulf, avoids jitter)

On eat:

```text
massA_new = massA_old + massB_old
massB_new = 0 (B dies)
```

### 3.4 Splitting & Merging

- **Split**:
  - Player can press a key to split a blob.
  - A blob of mass `m` becomes two blobs of mass `m/2` each.
  - One child is launched forward with initial burst velocity.
  - Limit number of blobs per player (e.g. max 4).

- **Recombination**:
  - After `t_recombine` seconds, blobs belonging to the same player that overlap gradually merge back into a single blob.

### 3.5 Pellets

- Each pellet has fixed mass: `PELLET_MASS`.
- Spawned by server over time according to a spawn rate and a cap on total pellets.
- Eating a pellet:

  ```text
  blob.mass += PELLET_MASS
  pellet is removed
  ```

- Total pellet mass per round is chosen by the server as a **game design choice**, but ultimately must be backed by available USDC (deposits + worldPool - rake) via MPD and the final on-chain invariant.

---

## 4. Economic Model (Minimal Data)

The economy is built from **just a few core pieces**:

- `MPD`: fixed per lobby.
- Player **deposits** per round.
- Player **finalMass** per round.
- Player **claimables**.
- A **rake** rate.
- **worldPool** is implicit (contract balance minus claimables and deposits).

Everything else is off-chain game logic.

### 4.1 MPD per Lobby

For each lobby:

```text
MPD = M_base / B
```

- `B` = base buy-in (USDC)
- `M_base` = desired starting mass for a player who buys in with `B`

**Conversion:**

- Deposit `D` USDC → `D * MPD` mass injected into the world (some to spawns, some to pellets, some possibly kept in reserve).
- At the end of a round, `mass` converts back to USDC via:

  ```text
  USDC = mass / MPD
  ```

### 4.2 Deposits & Upfront Deductions

To ensure elegance and immediate solvency, we deduct both the **Developer Rake** and the **World Pool Contribution** *before* converting to mass.

Let:

- `D` = Deposit Amount
- `rakeBps` = Developer fee (e.g., 2.5%)
- `worldBps` = World Pool contribution (e.g., 2.5%)
- `netBps` = `10000 - rakeBps - worldBps`

**Calculations:**

1. `rakeAmount = D * rakeBps / 10000`
2. `worldAmount = D * worldBps / 10000`
3. `spawnAmount = D - rakeAmount - worldAmount`

**Flow:**

1. User calls `deposit(amount)`.
2. Contract:
   - Sends `rakeAmount` to Treasury.
   - Keeps `worldAmount` (implicitly adds to World Pool).
   - Keeps `spawnAmount` (implicitly backs the new player).
   - Emits `Deposit(user, spawnAmount, rakeAmount, worldAmount)`.

3. Server spawns player:
   - `Mass = spawnAmount * MPD`

This way, the user enters the game with exactly the mass they "paid for" after fees.

### 4.3 End-of-Round

Since fees were taken upfront, the end-of-round logic is purely about payouts.

**Process:**
1. Server computes `finalMass` for all players.
2. Server computes `totalPayout = Σ finalMass / MPD`.
3. Server calls `commitRoundResults(...)`.

The contract ensures:
```text
contractBalance >= totalPayout + existingClaimables
```
(Rake was already sent; World Pool is just the excess balance).

Off-chain, the server is allowed to conceptually "draw" from the worldPool to create more pellet mass for a round.

The contract does **not** need to track worldPool explicitly. It only needs to ensure:

- Total payouts don't exceed available funds (contract balance minus claimables)
- The remainder stays in the contract, implicitly backing future pellets

From the contract's perspective:

```text
availableUSDC = contractBalance - totalClaimable
```

After a round:

```text
newClaimables = Σ(finalMass_i / MPD)
```

The contract just verifies it can cover all claimables after the round.

### 4.4 End-of-Round Values

At the end of a round:

- For each player i:
  - Server computes `finalMass_i` (sum of all living blobs).
- Dead players have `finalMass_i = 0` or are omitted.
- The server still has pellets on the map—their backing value simply remains in `worldPool`.

Let:

```text
totalFinalMass = Σ finalMass_i
totalPayoutUSDC = totalFinalMass / MPD
```

### 4.5 Single On-Chain Invariant

The contract ensures it remains solvent for all pending claims.

```text
contractBalance >= totalClaimable_new
```

Where:
- `totalClaimable_new = totalClaimable_old + totalPayoutUSDC`

Any excess balance beyond `totalClaimable` is the **Implicit World Pool**.

### 4.6 What the Contract Actually Needs

The contract does **not** need:

- Per-round "prize pool" variables.
- Spawn/pellet splits.
- Explicit `worldPoolUSDC` tracking—it's implicit in the contract balance.

The contract only needs, per `commitRoundResults`:

- `players[]`
- `finalMasses[]`
- It knows:
  - `massPerEth` (MPD)
  - Its own ETH balance

Using these it:

1. Computes `totalPayoutUSDC = Σ(finalMass_i / MPD)`.
2. Sets:
   - `claimable[player_i] += finalMass_i / MPD`


---

## 5. Smart Contract Specification (Minimal State)

### 5.1 Storage

For each lobby/server contract:

```solidity
struct LobbyParams {
    uint256 baseBuyIn;         // B
    uint256 massPerEth;        // MPD
    uint256 rakeBps;           // e.g. 250 (2.5%)
    uint256 worldBps;          // e.g. 250 (2.5%)
}

LobbyParams public lobby;

mapping(address => uint256) public claimable;  // USDC claimable by players

address public serverAddress;                  // authorized game server
address public treasury;                       // rake destination
address public usdcToken;                      // USDC ERC20 contract

// worldPool is implicit: contractBalance - Σclaimable
```

### 5.2 Events

```solidity
event Deposit(address indexed player, uint256 netAmount, uint256 rakeAmount, uint256 worldAmount);
event RoundCommitted(
    bytes32 indexed roundId,
    uint256 totalPayoutUSDC
);
event Claim(address indexed player, uint256 amount);
```

### 5.3 Methods

#### `deposit(uint256 amountUSDC)`

- Calculates `rake = amount * rakeBps / 10000`.
- Calculates `world = amount * worldBps / 10000`.
- Calculates `net = amount - rake - world`.
- Transfers `rake` to `treasury`.
- Emits `Deposit(msg.sender, net, rake, world)`.
- **Stateless:** No mapping updated. Funds (`net` + `world`) sit in contract.

#### `endRound(
    bytes32 roundId,
    address[] calldata players,
    uint256[] calldata finalMasses
) external`

- `onlyServer`.
- Steps:
  1. `totalPayoutUSDC = Σ (finalMasses[i] * 1e6 / MPD)`.
  2. Check solvency: `contractBalance >= totalPayoutUSDC + totalClaimable`.
  3. For each player i:
     - `claimable[players[i]] += finalMasses[i] * 1e6 / MPD`.
  4. Emit `Round`.


#### `claim()`

- Sends `claimable[msg.sender]` USDC to the player.
- Sets `claimable[msg.sender] = 0`.
- Emits `Claim`.

#### `setServerAddress(address newServer)` (admin)

- Updates `serverAddress`.

---

## 6. Game Server Specification

### 6.1 Responsibilities

- Maintain **authoritative game state**.
- Respond to player inputs (movement, split, etc.).
- Handle:
  - Collision & eating
  - Pellet spawning & despawning
  - Player deaths and respawns (if any)
- Manage **round lifecycle**:
  - Start when enough deposits are in.
  - End after fixed duration.
  - Compute `finalMass` per player.
  - Compute `unclaimedPelletMass`.
  - Call `commitRoundResults`.

### 6.2 State Model (Simplified Typescript)

```ts
type Blob = {
  id: string;
  owner: string;   // player address
  mass: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type Pellet = {
  id: string;
  mass: number;    // typically PELLET_MASS
  x: number;
  y: number;
};

type PlayerState = {
  address: string;
  blobs: Blob[];
  alive: boolean;
};

type GameState = {
  players: Map<string, PlayerState>;
  pellets: Map<string, Pellet>;
  timeElapsed: number;
  rngSeed: string;
};
```

### 6.3 Pellet Spawning (Off-Chain Logic)

Server tracks:
- `virtualWorldPoolMass`: Mass available to be spawned (derived from contract's implicit worldPool).
- `activePelletMass`: Sum of all current pellets on map.

Per tick:

```ts
function tickPelletSpawner(deltaTime: number) {
  // 1. Hard Cap on Count
  if (pellets.size >= MAX_PELLETS) return;
  
  // 2. Hard Cap on Budget (Solvency)
  if (activePelletMass + PELLET_MASS > virtualWorldPoolMass) return;

  const expectedSpawns = desiredPelletsPerSecond * deltaTime;
  const spawns = samplePoisson(expectedSpawns);

  for (let i = 0; i < spawns; i++) {
    if (pellets.size >= MAX_PELLETS) break;
    // Double check budget inside loop
    if (activePelletMass + PELLET_MASS > virtualWorldPoolMass) break;

    spawnPellet(randomPos(), PELLET_MASS);
    activePelletMass += PELLET_MASS;
  }
}
```

**Note:** When a player deposits, `worldAmount` is converted to mass and added to `virtualWorldPoolMass`. When a round ends, uneaten pellets effectively merge back into the pool for the next round (or persist if the world is persistent).

### 6.4 End-of-Round Computations

At round end:

1. For each player:
   - `finalMass_i = sum(player.blobs.map(b => b.mass))`
2. Call contract:

   ```ts
   commitRoundResults(roundId, players[], finalMasses[])
   ```

Where:

- `players[]` is the list of player addresses.
- `finalMasses[]` is aligned by index with `players[]`.
- Uneaten pellets remain on the server; their backing value stays in `worldPool`.

---

## 7. Client UX Flow

1. **Landing Page**
   - “Play for $1 / $5 / $20”
   - Lobby cards show:
     - Buy-in
     - Approximate number of players
     - Est. round time

2. **Auth / Wallet**
   - Login via Privy (Google, email, etc.).
   - User gets a Base wallet.
   - Show USDC balance.
   - Onramp options to buy USDC.

3. **Lobby Select**
   - User picks a lobby/tier.
   - Optionally sees expected skill level, prize multipliers, etc.

4. **Deposit**
   - User chooses amount (e.g., 5 USDC).
   - Calls `deposit` (gasless via Paymaster).
   - UI shows “Waiting for round to start…”

5. **Match Start**
   - Server acknowledges deposit event.
   - When enough players are in or countdown ends, the round starts.
   - Blob spawns with mass determined by server’s mass allocation logic.

6. **Gameplay**
   - Real-time movement, splits, eats.
   - UI shows:
     - Current mass
     - Approx. USDC value (`mass / MPD`)

7. **Round End**
   - “Round Over” screen.
   - Show:
     - Starting buy-in
     - Final mass
     - Final payout in USDC (pending claim)

8. **Claim**
   - Click “Claim” triggers `claim()` to transfer USDC from contract to user wallet.

9. **Repeat**
   - User can play more rounds.
   - The worldPool silently evolves in the background, shaping long-term pellet economics.

---

## 8. Security & Fairness

### 8.1 Authoritative Server

- Clients send **inputs only**.
- All physics and state changes happen on server.
- Prevents:
  - Speed hacks
  - Fake size/mass
  - Teleporting

### 8.2 Commit-Reveal RNG (Optional Enh)

- For extra fairness:
  - Server pre-commits `hash(roundSeed)` at round start.
  - Uses `roundSeed` to generate:
    - Pellet positions
    - Spawn positions
  - At `commitRoundResults`, server reveals `roundSeed`.
  - Off-chain verifiers can reconstruct the round and check it matches.

### 8.3 Economic Verification

- Anyone can recompute:
  - `D_total` from events.
  - `rakeUSDC`, `totalPayoutUSDC`.
  - Contract's USDC balance vs. total claimables.
- Verify the contract is always solvent (balance >= total claimables).
- Detect any misbehavior from server or contract bugs.

---

## 9. Tuning & Extensions

### 9.1 Tuning Knobs

Per lobby:

- `B`, `M_base` → sets MPD and “feel”.
- `rakeBps` → business model.
- Round duration.
- Target player count per round.
- Pellet parameters:
  - `PELLET_MASS`
  - `desiredPelletsPerSecond`
  - `MAX_PELLETS`
- Spawn patterns & map size.

### 9.2 Possible Extensions

- **Ranked ladders** using ELO / MMR.
- **Cosmetic skins** (non-economic).
- **Seasonal leaderboards** with manual prize distributions.
- **Anti-bot heuristics** on server side.
- **Variable worldPool policies**, e.g.:
  - Inject a fraction of rake into worldPool to ensure it doesn’t dry out.
  - Caps on worldPool growth.

---

## 10. Summary

This spec defines an Agar.io-style crypto game where:

- **Mass is the only in-game unit of value.**
- A fixed **MPD** per lobby bridges mass and USDC.
- The contract only needs:
  - Player claimables
  - MPD
  - `finalMass_i` per player
- **worldPool is implicit**—it's the contract's USDC balance minus claimables.
- A single invariant guarantees economic correctness:

  ```text
  contractBalance >= totalClaimable
  ```

Everything else—pellet logic, spawn patterns, split limits—is a **pure game-design decision**, free to evolve without changing the on-chain model. Uneaten pellets simply remain backed by the implicit worldPool.