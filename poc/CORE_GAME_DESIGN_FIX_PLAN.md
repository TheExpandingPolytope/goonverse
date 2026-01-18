### Core Game Design Fix Plan (Top 3 Issues)

This document is a brief, **implementation-oriented plan** to fix the top 3 blockers we identified:
- **(A) Small-is-strong / wealth→power curve is inverted**
- **(B) Exit denial (“crab bucket”)**
- **(C) Money conservation / reserve accounting is inconsistent**

This PoC is being designed with the real target in mind: **~100 players per server**, server-authoritative ticks, and stable game-theoretic incentives.

---

### 0) Current Rules (as implemented)

- **Entry**: wallet pays `CONFIG.entryFee` ($20); player spawns with `CONFIG.startBalance` ($20).
- **Balance = HP**: damage reduces balance; spills spawn as collectible money.
- **Size**: `radius ≈ (balanceDollars ^ radiusExponent) * moneyScale`, clamped to `[radiusMin, radiusMax]` (see `Entity.getRadius()`).
- **Mobility scaling**:
  - Movement accel uses `accelPerSec * mobilityMult`
  - Speed cap uses `maxSpeedBase * mobilityMult`
  - `mobilityMult` is **bounded** (small gets a modest boost, big gets a modest penalty).
- **Exit**: hold **Q** for `CONFIG.exitDurationTicks`; you can’t act; movement is heavily damped.
  - Bullet damage **rewinds** `exitProgress` (does not hard-cancel).
  - Dash-stun **hard-cancels**.
  - Releasing Q drops progress to **0**.
- **Burn (tax)**: every 1s, subtract `baseTaxRate + floor(balance * wealthTaxRate/100)` from each player/bot, and **transfer it to world reserve**.
- **Reserve + pellets**:
  - Shoot/dash costs and burn/tax feed `state.worldReserve`
  - Pellets draw from reserve
  - `ensurePellets()` only spawns if reserve can fund (no minting).

---

### A) Fix “Small Is Strong” (Wealth→Power Curve)

#### What’s wrong today
- Low-balance players are **harder to hit** (small) and **more mobile** (higher accel + speed cap).
- High-balance players become **large + slower**, often feeling weaker despite having more HP.
- Result: the equilibrium can drift toward “stay small and evasive” rather than “grow and cash out.”

#### Target behavior
- More balance should be **net-positive power** (survivability + presence), while still creating **pressure to exit**.
- Small players can be “nimble,” but should not be *strictly advantaged* in combat.

#### Planned changes (config-driven, tuneable)
- **Compress the size curve**:
  - Change radius growth from `sqrt(balance)` to a softer exponent / clamped curve so whales aren’t 3× radius.
  - Add configurable parameters:
    - `radiusExponent` (e.g. 0.35–0.45)
    - `radiusMin`, `radiusMax`
- **Flatten the mobility curve**:
  - Replace the raw `12 / sqrt(radius)` multiplier with a bounded multiplier:
    - `mobilityMult = clamp( (radiusRef / radius)^k , mobilityMin, mobilityMax )`
  - Add configurable parameters:
    - `mobilityExponent` (k)
    - `mobilityMin`, `mobilityMax`
    - `radiusRef` (reference radius around “baseline player”)

#### Acceptance checks
- **$20 vs $200** (example): speed/accel advantage for small should be **noticeable but not oppressive** (target: ~10–30%, not ~40–50%).
- Larger players should not feel like “giant practice targets” with no ability to pressure.

---

### B) Fix Exit Denial (Make Exit Viable Under Pressure)

#### What’s wrong today
- Exit channel is **fully reset by any damage**, so an opponent can “tap” you forever.
- With ~100 players, the probability that someone can keep you tagged becomes high.

#### Target behavior
- Exit should be **possible with good play**, but still **contestable**.
- Exit denial should require **meaningful commitment**, not cheap spam.

#### Planned changes (simple + robust)
- **Change “any damage cancels exit” → “damage rewinds exit progress”**
  - On bullet damage while exiting:
    - Reduce `exitProgress` by a penalty (in ticks) instead of resetting to 0.
    - Penalty scales with damage magnitude (small hits slow you; big hits meaningfully set you back).
    - Releasing **Q** still drops progress to **0** (simple rule).
- **Keep hard counters**
  - **Dash-stun** can still fully cancel exit (high commitment, high clarity).
- **Add an “exit beacon” (contestability scales with wealth)**
  - While exiting, the player emits a beacon whose **range scales with balance**.
  - In PoC: used to drive bot behavior + local UI; in real server: broadcast to nearby players.
- **Optional (if needed for 100-player servers)**
  - Exit progress rate scales up if **no enemies near you** (anti-grief in dense lobbies).
  - A “minimum distance from nearest enemy” requirement to *start* an exit channel (prevents exiting mid-brawl).

#### Acceptance checks
- A player being lightly pressured can still exit **sometimes** (skillful positioning matters).
- A committed attacker (dash + follow-up) can still stop an exit.
- Exit cannot be denied indefinitely by “penny shots.”

---

### C) Fix Money Conservation / Reserve Accounting (Make the Economy Real)

#### What’s wrong today (implementation mismatches)
- **Burn deletes money** instead of routing to reserve.
- `ensurePellets()` spawns pellets without reserve debit (minting).
- Shooting/dash costs are partially routed to reserve and other parts are implicitly burned or double-counted (e.g. missed bullets adding value to reserve).

#### Target invariant
Within an active match, the **total money supply** should be conserved:
- Money exists only as:
  - player/bot balances
  - world reserve
  - on-ground collectibles (food/spills)
  - (optionally) in-flight escrow if we choose to model it

Wallet entry/exit is explicitly **outside** the match economy.

#### Planned changes
- **Route burn to reserve**
  - When `totalTax` is applied: `state.worldReserve += totalTax`.
- **Pellets must always be funded**
  - `ensurePellets()` should only spawn if `worldReserve >= pelletValue`, and each spawn debits reserve.
  - If reserve is low, allow pellet count to drop below `minPellets` (no minting).
- **Action costs must be conserved**
  - When paying shoot/dash costs, route the debited amount into `worldReserve` (100% unless we explicitly design a different split that still sums to 100%).
  - Remove any “double deposit” paths (e.g., missed bullet expiry adding money again).
- **Add a dev-only invariant check**
  - Per tick, compute `sum(players + reserve + ground + bulletsEscrow)` and assert it stays constant (within rounding).

#### Acceptance checks
- No minting from `ensurePellets()`.
- No silent burn (unless explicitly designed).
- Reserve never goes negative; total supply stays stable across time.

---

### Implementation Order (to finish today)
- **Step 1 (C)**: Fix conservation first (it changes EV for everything).
- **Step 2 (B)**: Make exit viable under pressure.
- **Step 3 (A)**: Re-shape size + mobility curves with config knobs and tune quickly.

Once these three are stable, we’ll move to the remaining concerns list (third-partying, attribution, spawn safety, etc.).

