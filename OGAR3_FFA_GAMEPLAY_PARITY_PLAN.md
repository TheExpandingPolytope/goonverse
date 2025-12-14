### Ogar3 FFA Gameplay Parity Plan (Server + Client)

This document describes how we will make `/packages/server` gameplay mechanics behave **the same as Ogar3 FFA**, while keeping our **economic/auth/deposit/exit** logic as a separate layer.

References:
- Ogar3 repo: `https://github.com/Faris90/Ogar3.git`

---

### 0. Goal

- **Primary goal**: Match **Ogar3 FFA** “feel” and mechanics for:
  - Movement / speed curve
  - Eating rules (thresholds + engulf distance)
  - Split behavior (burst physics + limits)
  - Recombine/merge behavior
  - Eject mass behavior (cost, projectile motion)
  - Virus behavior (spawn, feeding, popping)
  - Mass decay behavior
  - Spawn behavior (spawn placement + food consumption)
  - Tick cadence and ordering (important for edge cases)

---

### 1. Non-goals

- **Protocol compatibility** with classic Agar.io clients (Ogar3’s binary packets) is NOT required.
- **Multiple game modes** are NOT required (we only implement FFA).
- **Copying Ogar3 function/class names** is NOT desired. We will match behavior, not naming.

---

### 2. Hard constraints / invariants

- **Economics remain ours**:
  - Deposits determine spawn mass (or another deterministic rule we control).
  - Exit tickets / hold-to-exit are allowed to exist, but must not alter “normal play” mechanics except when a player is explicitly exiting (economic overlay).
  - World-balance-backed food spawning may cap food availability; that is an economic constraint layered on top of Ogar-like mechanics.

- **Server authoritative**:
  - Client provides input only (mouse position + key presses).
  - Server runs the authoritative simulation at 20Hz, matching Ogar3’s 50ms logic.

---

### 3. Target behavior (Ogar3 FFA mechanics — spec form)

This is the “contract” we are matching. We’ll implement the same *outcomes*, even if our internal code structure differs.

#### 3.1 Tick rates and timing

- **Simulation tick**: 50ms steps (20Hz).
- **Once-per-second step**: every 20 simulation ticks:
  - Decrement recombine timers
  - Apply mass decay
  - Update leaderboard / “score” values (client-facing)

#### 3.2 World bounds

Ogar3 uses borders (`left`, `right`, `top`, `bottom`). Defaults:
- `left=0`, `top=0`, `right=6000`, `bottom=6000`

Important detail: Ogar3 clamps player movement to keep the player center at least `radius/2` from borders (not `radius`).

#### 3.3 Mass → radius (“size”) conversion

Ogar3 radius is derived as:

\[
radius = \lceil \sqrt{100 \cdot mass} \rceil
\]

We should treat this as the authoritative radius used in:
- movement clamping
- collision / eat checks
- spawn offsets

#### 3.3.1 Numeric conventions (rounding)

For close parity with Ogar3 edge cases:
- Treat **positions** as integers (Ogar3 truncates with bitwise operations in several places).
- Treat **radius** as `ceil(sqrt(100*mass))` (integer).
- When we need “Ogar-like” truncation, prefer `Math.trunc(...)` over floats.

#### 3.4 Player speed curve

Ogar3 uses a mass-based speed curve (smaller mass → faster). With defaults:
- `playerSpeed = 30`
- extra factor: `50/40` baked into speed (Ogar3 assumes 50ms ticks)

Spec:

\[
baseSpeed(m) = playerSpeed \cdot m^{-1/4.5} \cdot \frac{tickMs}{40}
\]

With `tickMs=50`, this matches Ogar3’s `*50/40`.

#### 3.5 Movement update (mouse-driven, no acceleration integration)

Per player-cell per tick:
- Compute direction from cell center to mouse position.
- Compute distance to mouse.
- Use:
  - `step = min(baseSpeed(mass), distanceToMouse)`
- New position:
  - `x += step * sin(angle)`
  - `y += step * cos(angle)`
  - where `angle` is computed using the same convention Ogar3 uses (effectively “atan2(dx, dy)”).

Same-owner collision push (pre-recombine):
- If two owned cells cannot recombine yet, apply a push-away adjustment so they don’t overlap.

#### 3.6 Split behavior (burst / “move engine”)

Constraints:
- `minSplitMass = 36`
- `maxPlayerCells = 16`

On split input:
- For each owned cell (Ogar3 splits *all* eligible cells when split is triggered):
  - If cell mass >= minSplitMass and player cell count < maxPlayerCells:
    - Split into two equal halves
    - Spawn child cell with a forward burst using a “move engine”

Spawn placement detail (for parity):
- The new split cell is spawned with a **small forward offset** from the parent (Ogar3 uses roughly `parentRadius/2` along the split direction, not a full-radius offset).

“Move engine” concept (Ogar3):
- A moving cell has:
  - `moveAngle`
  - `moveSpeed`
  - `moveTicksRemaining`
  - `moveDecay`
- Each tick while moving:
  - position updates by `moveSpeed` along the angle (with sin/cos convention)
  - `moveSpeed *= moveDecay`
  - `moveTicksRemaining--`

Ogar3 split burst defaults:
- `splitSpeed = baseSpeed(parentMassBeforeSplit) * playerSplitSpeedMultiplier`
- `playerSplitSpeedMultiplier = 6`
- `moveTicksRemaining = 32`
- `moveDecay = 0.85`

Smooth split collision suppression (Ogar3):
- If enabled (`playerSmoothSplit = 1`), new split cells temporarily ignore collision with same-owner cells for ~8 ticks.

#### 3.7 Recombine / merge

Ogar3 does **not** “merge by overlap + explicit merge rule”.

Instead:
- Each cell has a recombine timer (in seconds).
- While recombine timer > 0:
  - owned cells cannot “eat” each other, and they push off each other during movement
- Once recombine timer == 0:
  - owned cells can **eat** each other using the same eat rule but with a multiplier of `1.0`
  - (i.e., “merge happens by consuming your own cells”)

Recombine timer assignment:
- After splitting: recombine time depends on mass:
  - `recombineSeconds = base + floor(0.02 * mass)`
  - with `base = playerRecombineTime` (default 30)

#### 3.8 Eating rules (players, food, ejected, virus)

Ogar3 uses:
- A broadphase “within circle” approximation using squared checks.
- A mass threshold multiplier:
  - player prey: `1.25`
  - virus prey: `1.33`
  - same-owner (when recombine timers are 0): `1.00`
  - food is special-cased (if in broadphase, it is eaten; no extra checks)

Then it uses an engulf-distance check:
- `distance(eater, prey) <= eaterRadius - preyEatingRange`
- preyEatingRange:
  - player prey: `0.4 * preyRadius`
  - virus prey: `0.4 * preyRadius`
  - food / ejected: `0`

Ejected mass has an important side effect in Ogar3:
- Small players can’t eat ejected mass unless they meet the mass multiplier threshold.

Broadphase detail (for parity):
- Let `dx = preyX - eaterX`, `dy = preyY - eaterY`
- Let `eaterSquare = 100 * eaterMass`
- Let `preySquare = 100 * preyMass`
- Candidate passes broadphase if:
  - for food: `dx² + dy² + 1 <= eaterSquare`
  - otherwise: `dx² + dy² + preySquare <= eaterSquare`

#### 3.8.1 Mass gain and max-mass overflow behavior (important)

Ogar3 applies a **maximum mass cap** per player cell (default `playerMaxMass = 22500`) with special overflow behavior:
- When a cell gains mass (by eating) and `mass + gainedMass > playerMaxMass`:
  - If the player still has free cell slots (`cellsOwned < maxPlayerCells`), the cell **auto-splits due to overflow**:
    - set `mass = (mass + gainedMass) / 2`
    - spawn a new player cell at the same position with the same mass value
    - give the new cell a short burst using the move engine (15 ticks) with a fixed angle and high speed
  - Else (already at max cells), clamp to `playerMaxMass` and discard the overflow.

This is distinct from the manual split key and must be implemented for high-mass parity.

#### 3.9 Eject mass (W)

Constraints:
- `minEjectMass = 32`

On eject input:
- For each owned cell:
  - If cell mass >= minEjectMass:
    - Subtract `ejectMassLoss` from parent (default 16)
    - Spawn ejected mass of `ejectMass` (default 12)
    - Give it a “move engine”:
      - speed `ejectSpeed` (default 160)
      - ticks `20`
      - decay default `0.75`
    - Angle is mouse angle ± a small random jitter (±0.2 radians)

Spawn placement detail (for parity):
- Ejected mass spawns at:
  - `parentPos + (parentRadius + 5 + ejectMass) * direction`
  - Note: Ogar3 adds `ejectMass` (a mass value) into the offset, not the ejected radius.

Move-engine border behavior (for parity):
- Ogar3 uses a fixed radius constant (≈40) when bouncing moving nodes off borders.

#### 3.10 Virus behavior (FFA)

Virus spawning:
- Maintain at least `virusMinAmount` (default 10), capped at `virusMaxAmount` (default 50).
- Spawn checks avoid overlapping large players and existing viruses.

Virus feeding:
- When an ejected mass finishes moving, it may feed a nearby virus (only if virus count < virusMaxAmount).
- After `virusFeedAmount` feeds (default 7), virus “shoots” a new virus as a moving node.

Virus consumption (“pop”):
- When a player cell consumes a virus:
  - The consumer is forced to split into many cells depending on mass and available cell slots.
  - Newly created cells use burst movement and recombine timers.

##### 3.10.1 Virus pop algorithm (FFA) — concrete

To match Ogar3, implement the same sequence:
- **Step 1: compute split budget** (based on the consumer mass *before* splitting)
  - `maxSplits = floor(consumerMass / 16) - 1`
  - `availableSlots = maxPlayerCells - currentPlayerCellCount`
  - `numSplits = min(availableSlots, maxSplits)`
  - `splitMass = min(consumerMass / (numSplits + 1), 36)`

- **Step 2: add virus mass to the consumer** (before generating child cells)
  - This mass add must use the same “max-mass overflow” rule described in 3.8.1.

- **Step 3: if `numSplits <= 0`, stop** (no further splitting possible)

- **Step 4: decide “big splits”** based on the consumer’s remaining mass after reserving small splits
  - `endMass = consumerMassAfterVirus - (numSplits * splitMass)`
  - If `endMass > 300` and `numSplits > 0`: `bigSplits++`, `numSplits--`
  - If `endMass > 1200` and `numSplits > 0`: `bigSplits++`, `numSplits--`
  - If `endMass > 3000` and `numSplits > 0`: `bigSplits++`, `numSplits--`

- **Step 5: create `numSplits` small splits**
  - iterate angle in equal steps and spawn `splitMass` cells using a 15-tick move engine burst (high speed, “popsplit”)
  - subtract `splitMass` from consumer for each spawned cell

- **Step 6: create `bigSplits` large splits**
  - for each big split:
    - choose random angle
    - set `splitMass = consumerMass / 4`
    - spawn that cell using a 15-tick move engine burst (low speed)
    - subtract from consumer

- **Step 7: reset consumer recombine timer** (prevents instant merge)

We will reproduce these numbers exactly (including thresholds 300/1200/3000, 36 max split mass, etc.) to avoid subtle parity drift.

#### 3.11 Food spawning

Food spawning defaults:
- Start with `foodStartAmount = 100`.
- Every `spawnInterval = 20` ticks:
  - Spawn up to `foodSpawnAmount = 10`
  - Until `foodMaxAmount = 500`
- Food mass is random between `foodMass` and `foodMass + foodMaxMass - 1` (defaults 1..4).

#### 3.12 Spawn behavior (important for feel)

Ogar3 spawn selection is *not purely random*:
- It may spawn a player on top of an existing food position and consume that food node.

FFA also has an additional mechanic where spawns can happen from ejected mass sometimes; we need to decide how this interacts with deposit-driven spawn mass.

#### 3.13 Ordering & determinism

Ogar3 is order-sensitive:
- Player cell movement and eating happen in a particular sequential order within the tick.
- Moving nodes update separately after player cells.
- “Once per second” updates happen after a fixed number of main ticks.

To match Ogar3, we must be explicit about:
- iteration order for player cells
- when removals happen
- when newly spawned nodes become eligible to be eaten/moved

---

### 4. Current gaps vs target (high-signal)

#### 4.1 Movement model mismatch

Our current server:
- uses acceleration + friction + velocity integration
- uses a normalized direction input and projects an arbitrary far target

Ogar3:
- uses direct step-to-mouse with `min(speed, distance)` and no acceleration state

This must be replaced to match feel.

#### 4.2 Eating mismatch

Our current server:
- uses radius ratio + overlap factor thresholds

Ogar3:
- uses mass multipliers + eatingRange and a broadphase squared check

Must be replaced.

#### 4.3 Split/merge mismatch

Our current server:
- max 4 blobs
- explicit merge system + attraction + soft collision forces

Ogar3:
- max 16 cells
- merge is “eat your own cell after recombine timers expire”
- split uses a move engine burst with decay

Must be replaced.

#### 4.4 Missing mechanics

We currently don’t implement:
- viruses (spawn/feed/pop)
- mass decay
- Ogar3 food spawn schedule + variable food mass
- Ogar3 spawn placement rules

---

### 5. Implementation plan — server (`/packages/server`)

#### 5.1 Data model changes (authoritative state)

We’ll model the world as a unified set of “nodes” (not necessarily named the same as Ogar3), with:
- `id` (numeric, monotonically increasing)
- `type` (player, food, virus, ejected)
- `x`, `y`
- `mass`, `radius`
- `color`
- `ownerSessionId` (player nodes only)
- recombine timer / ignore-collision timers (player nodes only)
- move-engine state (for moving nodes: split cells, ejected, shot virus)

We can keep Colyseus Schema as the sync layer, but the internal simulation should:
- use stable iteration order
- avoid relying on Schema iteration ordering for determinism

#### 5.2 Input handling changes (server-side)

We will store per-player input state:
- `mouseX`, `mouseY` in world coordinates
- edge-trigger events:
  - `splitPressed` (one-shot)
  - `ejectPressed` (one-shot)

Economic input (exit-hold) remains separate and is explicitly allowed to diverge from Ogar3.

#### 5.3 Systems / responsibilities (rename freely, match behavior)

We’ll replace current “physics/eating/split/merge” with Ogar3-equivalent behavior broken into modules like:
- movement update for player nodes
- collision/eat resolution (including merge-by-eat)
- move-engine update for moving nodes
- food spawning schedule
- virus spawning schedule
- virus feeding and virus pop rules
- once-per-second maintenance (recombine timers + mass decay)

We will not preserve current force-based attraction or explicit merge.

#### 5.4 Tick pipeline (must match order)

Each 50ms tick:
- Step A: Update each player-controlled node:
  - movement step toward mouse
  - resolve potential eats in-range immediately (remove nodes immediately)
- Step B: Update moving nodes via move-engine:
  - apply movement + decay
  - apply “auto move hooks” (e.g., ejected feeding viruses)
- Step C: Spawn food/viruses based on tick counters
- Step D: Every 20 ticks:
  - decrement recombine timers
  - apply mass decay
  - recompute leaderboard values

#### 5.5 Spatial querying (performance without changing outcomes)

Ogar3 uses “visible nodes” as a performance shortcut; we can use a spatial index:
- Query candidates within eater radius (or slightly larger) and then apply exact Ogar3 checks.

This should match outcomes as long as:
- the candidate query always includes any node that could pass the Ogar3 broadphase

#### 5.6 Spawn rules under deposits (decision)

We will match Ogar3’s spawn placement behavior while preserving deposit-based mass:
- Spawn position selection can still use “pick food position and remove food” logic.
- Starting mass remains “deposit-derived mass” (economic), unless we explicitly decide to emulate the FFA ejected-spawn mass behavior.

Decision point (we should decide before coding):
- **Option A (economic-safe)**: Ogar3 spawn placement rules (including “spawn on food” and optionally “spawn on ejected”), but **spawn mass remains deposit-derived**.
  - If the spawn picks a food/ejected node as the spawn anchor, we still **remove** that node from the world to preserve Ogar3’s “consumed spawn anchor” behavior.
  - If spawning on ejected, we may also inherit **color** (Ogar3 does) without inheriting **mass** (economic layer owns mass).

- **Option B (pure Ogar3 spawn)**: If spawn is chosen from ejected mass, also set starting mass to the ejected mass (and inherit its color).
  - This is the closest match to Ogar3 FFA, but it directly conflicts with “deposit determines starting mass” unless we invent extra economic rules (e.g., deposit mass goes to world balance, deferred credit, etc.).

**Chosen approach for this project**: **Option A** (economic-safe), because you explicitly want to keep economic mechanics under our control while matching Ogar3 gameplay everywhere else.

#### 5.7 Visibility / information hiding parity (recommended)

Ogar3 does not send the entire world state to every client; it only sends what’s within a player’s view box.
While this is “networking”, it changes gameplay fairness (prevents ESP) and affects perceived parity.

Plan:
- Implement a per-player **view box** derived from total owned cell sizes (same functional shape as Ogar3).
- Send clients only:
  - nodes entering/leaving view
  - nodes moving within view
- Keep the authoritative simulation global, but enforce *information hiding* in the outbound stream.

Implementation options:
- **Option 1 (fastest)**: Keep Schema as full state, but send a second custom “visible nodes” message and have the renderer only consume that (still leaks to hacked clients if Schema contains everything).
- **Option 2 (best parity)**: Stop syncing full world via Schema; instead sync only per-client visible sets via custom messages (closest to Ogar3).

**Chosen approach for this project**: **Option 2 (best parity)**.

---

### 6. Implementation plan — client (`/packages/client`)

#### 6.1 Input payload must include mouse distance (world coords)

To match Ogar3 movement, the server must receive mouse coordinates with a meaningful distance:
- send `mouseX`, `mouseY` in world coordinates (not normalized direction vectors)

This requires:
- the client to compute camera transform
- convert screen pointer to world pointer using camera center and zoom

#### 6.2 Key events are edge-triggered

Ogar3 treats split/eject as “press once” events.

We should:
- send `splitPressed: true` only on keydown (one message)
- send `ejectPressed: true` only on keydown (one message)

Movement updates can remain throttled (e.g., 30ms), but must carry the latest `mouseX/mouseY`.

#### 6.3 Camera / zoom parity (recommended for feel)

While not strictly server “logic”, camera zoom strongly affects perceived feel.
To match Ogar3 more closely, align our zoom/view rules to the same functional shape:
- view range increases as mass increases
- spectator zoom differs from alive-player zoom

We can keep current renderer architecture; only the zoom rule and pointer→world mapping must be consistent.

---

### 7. Economic layer integration (explicit deviations allowed)

#### 7.1 Deposit → spawn mass

- Ogar3: fixed `playerStartMass` (10) and optional spawn-from-ejected.
- Ours: deposit-derived mass.

We will treat deposit→mass as a separate mapping and ensure:
- once spawned, all in-world mechanics operate on that mass exactly like Ogar3.

#### 7.2 Food spawn budget (world balance)

Ogar3 spawns food up to a cap. We may additionally restrict spawning if we lack world balance.
Implementation detail:
- still attempt spawns on Ogar3 schedule
- stop spawning early if budget disallows it

#### 7.3 Exit-hold / tickets

Exit hold is an economic overlay and can differ from Ogar3.
However, we should isolate it so:
- non-exiting players experience pure Ogar3 mechanics
- exiting players apply our economic rules intentionally (and clearly documented)

---

### 8. Validation plan (how we’ll know we matched)

#### 8.1 Unit-level “rule tests”

Add deterministic unit tests for:
- radius-from-mass
- speed curve
- movement step update
- eat eligibility for each type
- recombine timers
- mass decay step
- split + move-engine decay behavior
- eject + jitter + move-engine
- virus feed counters and pop outcomes

These tests should be written against our own rule functions (not copied names).

#### 8.2 Scenario simulations

Create a small simulation harness to replay fixed scenarios with a seeded RNG:
- 2-player chase/eat thresholds
- split-then-recombine timing
- eject feeding virus then virus shot
- virus pop producing multiple cells

We can validate by:
- comparing outputs to an Ogar3 reference run (optional)
- or validating against the spec above numerically (required)

#### 8.3 Manual “feel” checklist

Verify visually:
- movement responsiveness at small/medium/large mass
- split distance and burst decay
- eat thresholds (≈1.25× for players)
- ejected mass can’t be eaten when too small
- viruses behave identically (feed count, pop results)

---

### 9. Work breakdown (no feature flag)

1. **Agree on decisions**:
   - spawn-from-ejected behavior under deposits (Option A vs B)
   - whether we replicate Ogar3’s “radius/2 border clamp” exactly

2. **Client input refactor**:
   - send world mouse coords
   - send one-shot split/eject events
   - update pointer→world mapping and (optionally) zoom rule

3. **Server state refactor**:
   - introduce unified node model (player/food/virus/ejected)
   - create deterministic ID allocator

4. **Core mechanics rewrite** (match Ogar3):
   - movement step (mouse + speed curve)
   - split + move-engine
   - eat resolution (including merge-by-eat)
   - eject + move-engine + virus feed hooks
   - food + virus spawning schedule
   - recombine + mass decay 1Hz updates

5. **Parity tests + scenario harness**

6. **Tuning pass**:
   - align constants to Ogar3 defaults (map size, caps, rates)
   - ensure economy constraints don’t unintentionally distort baseline feel


