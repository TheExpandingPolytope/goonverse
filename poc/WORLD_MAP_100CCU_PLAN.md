# World Map Plan (Target: up to 100 CCU)

This doc is a **first-principles sizing + scaling plan** for the “Ballistic Capital” arena when we move from the PoC (few entities) to **~100 concurrent players**.

Key goals:
- **Comparable encounter rate** at different CCU (no “empty map” at 20 players, no constant chaos at 100).
- **Stable economy pacing** (pellets supplemental, fights ~80% of income).
- **Server friendliness** (spatial partitioning, FOV relevance).
- **Stake-scale invariance** (already implemented: most economy knobs scale from `CONFIG.entryFee`).

---

## 1) Choose the density target (the real driver)

Map size is not a “number”; it’s determined by the **density target** you want.

The cleanest density target for this game is:
- **Expected hostile players inside your effective FOV**: target 1–3

Because that translates directly to “how often fights happen” and “how safe cashout feels.”

### Definitions
- **CCU**: concurrent players in the match (max 100)
- **World area**: \(A = W^2\) where \(W\) is `CONFIG.worldSize`
- **Player density**: \(\lambda = \frac{N}{A}\)
- **Effective view radius** \(R\): radius in world units that roughly corresponds to what a player can see / react to

Expected players in view (Poisson approximation):
\[
E[\text{players in view}] \approx \lambda \cdot \pi R^2
\]

So to hit a target \(k\) with a **circular border**:

- Total playable area: \(A = \pi B^2\) where \(B\) is the **border radius**
- Density: \(\lambda = \frac{N}{\pi B^2}\)
- Expected players in view:
\[
E[\text{players in view}] \approx \lambda \cdot \pi R^2 = \frac{N R^2}{B^2}
\]

Solve for border radius:
\[
B \approx R \cdot \sqrt{\frac{N}{k}}
\]

### Config mapping (implemented in PoC)
In `poc/src/config.js` this is represented as:
- `playersInViewTarget` = \(k\)
- `playersInWorld` (runtime) = \(N\), clamped by `maxCCU`
- `maxCCU` = scaling cap
- `effectiveViewRadiusWorld` = \(R\)
- `borderRadius` (runtime) = derived \(B\) (moves toward target at `borderChangeSpeedPerSec`)
- `worldRadiusMax` = derived \(B\) for `maxCCU` (reference)

Also derived (runtime) from `playersInWorld`:
- pellet caps (`minPellets`, `maxPellets`, `maxPelletValueInWorld`)

Changing `playersInViewTarget` or `maxCCU` will automatically update scaling; `playersInWorld` changes in real time.

**Action item**: measure a realistic \(R\) (at typical zoom) by drawing a debug circle of “screen radius” in world units.

---

## 2) Practical scaling formula (using current PoC as baseline)

Current baseline:
- `B_base ≈ 1250` (border radius equivalent)
- `N_base = 3`

If we want to keep the same density:
\[
B(N) = B_{base} \cdot \sqrt{\frac{N}{N_{base}}}
\]

Examples:
- **N = 50**: \(2500 \cdot \sqrt{50/3} \approx 10206\)
- **N = 100**: \(2500 \cdot \sqrt{100/3} \approx 14433\)

In practice, for a PvP arena you often want **higher density** than the PoC so the map doesn’t feel empty.
Introduce a density factor \(d \in (0, 1]\):
\[
W(N) = W_{base} \cdot \sqrt{\frac{N}{N_{base}} \cdot d}
\]

Suggested starting points:
- **d = 0.6** (more fights):
  - N=50 → ~7900
  - N=100 → ~11180

Recommendation to start testing:
- **100 CCU**: `worldSize ≈ 11000–12000`
- **Average CCU ~50**: `worldSize ≈ 8000–9000`

---

## 3) Obstacles / cover scaling

Obstacle density should scale with **area**, not player count.

If `obstacleCount_base = 12` at `W_base = 2500`, then:
\[
\text{obstacleCount}(W) \approx 12 \cdot \left(\frac{W}{2500}\right)^2
\]

That explodes quickly, so we want a softer rule:
- Scale with area but clamp, and/or keep obstacle sizes larger on big maps.

Recommended knob set:
- `obstacleCount = clamp(round(k_area * W^2), min, max)`
- Use 2–3 size tiers (small/medium/large) so geometry stays interesting without needing huge counts.

---

## 4) Pellet / passive value scaling at 100 CCU

At 100 players, “global pellet count” can’t stay constant; otherwise passive income becomes irrelevant and UX looks empty.

But we still want **pellets supplemental**.

Suggested approach:
- Keep **pellet VALUE** as a fixed fraction of stake (already: `pelletValue ≈ 5% of stake`)
- Scale **pellet COUNT** roughly with map area and/or CCU, but cap **pellet total value** relative to:
  - stake * players in server
  - reserve level
  - “loose value on ground”

### Recommended direction for 100 CCU
- Replace global `minPellets/maxPellets` with:
  - **per-region caps** (grid/quadtree cells)
  - spawn bias toward mid-map “contested lanes”
- Continue using “loose value” caps:
  - total pellet value cap
  - plus spill value cap (optional)

This also maps to netcode: only send pickups relevant to the client’s region/FOV.

---

## 5) Spawn safety and pacing at scale

At 100 CCU, “spawn near center” is not enough.

Recommended spawn rule:
- pick a spawn point maximizing:
  - distance from nearest enemies
  - distance from recent combat heat
  - plus reasonable proximity to low-value pellets (so you’re not doomed)

This prevents “spawn into death” and reduces immediate exit urgency.

---

## 6) Netcode-friendly map partitioning

For 100 CCU you’ll want:
- **Spatial hash / uniform grid** for:
  - entity collisions
  - pickup magnet checks
  - bullet queries
- **FOV relevance**:
  - only replicate entities inside (or near) client FOV bounds + margin

This matches your earlier requirement: shakes/audio already use FOV checks.

---

## 7) What we need to measure next (so this isn’t guesswork)

Add a debug overlay (temporary) to measure:
- Effective view radius \(R\) in world units at typical zoom
- Players-in-view distribution at various CCU
- Median time-to-first-combat
- Exit success rate vs wealth vs #attackers

Once we have \(R\), we can compute `worldSize` precisely for your target “players in view.”

