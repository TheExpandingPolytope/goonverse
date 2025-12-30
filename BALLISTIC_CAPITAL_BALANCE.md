# BALLISTIC CAPITAL — Balance & EV Spec (v0.1)

This doc turns the **v7.1 design** into explicit math + tunable parameters so we can:

- **Prove game-theoretic soundness** (no dominant “always do X” actions).
- **Quantify risk/reward** for every action (money, time/commitment, cooldown/silence, exposure).
- **Reduce bot advantage** by forcing prediction + commitment (not frame-perfect reaction).

---

### Core invariants (locked)

- **Balance is everything**:
  - **Balance \(B\)** = health = economic mass.
  - **Mass \(m\)** = \(B\)
  - **Radius \(r\)** ∝ \(\sqrt{B}\) (constant density)
- **Full redistribution**:
  - **All burn + all action spend** flows into **Reserve** and comes back as pellets (no hidden sink).
- **Target TTK**:
  - **TTK_TARGET_SEC = 10** (equal starting balance, “typical duel” assumptions; see TTK model).
- **Exit-anytime**:
  - Players can **channel an exit anywhere** (punishable, interruptible).
  - Core objective is **positive PnL** and successful extraction.

---

### Economy & conservation of value

We model 3 places money can live:

- **Player balance**: held by entities (this is also HP/mass).
- **World spill**: physical pellets created by damage (tagged “hot” for attacker briefly).
- **Reserve**: pooled value created by **burn + action spend**; used to spawn baseline pellets.

**Invariants** (audit targets):

- **Damage is transfer + dispersion**:
  - Victim loses \(D\).
  - A fraction becomes spill pellets: \(D \cdot \eta_{spill}\).
  - Any remainder \(D \cdot (1 - \eta_{spill})\) goes to **Reserve** (still redistributed).
- **Action costs are never destroyed**:
  - All **burn** (passive + movement) and all **action spend** (shots, dash spool/boost, braking thrust) route value into **Reserve**.

**Design intent**:

- Camping is punished because **time always leaks** your balance into Reserve.
- Rich players are pressured because burn scales with \(B\).
- Every action is a **bet**: you can go broke by playing sloppy (spend + counter-damage).
- **PnL is the scoreboard**: players optimize **when to exit** vs **when to press**.

---

### Parameters we tune (top-level)

- **BUY_IN (server constant)**: \(B_0\) (e.g., \$5 or \$20)
- **START_BALANCE**: \(B_0\)
- **DEATH_BALANCE**: \(\max(0.025\cdot B_0,\ \$0.05)\)
- **TTK_TARGET_SEC**: 10
- **ENGAGEMENT_RANGE_UNITS**: **450** (typical duel distance; used to derive bullet speed)
- **BULLET_TOF_SEC_AT_RANGE**: 0.8 (meaningful travel time; prediction-heavy)

---

### Server buy-in normalization (critical)

Each server/world has a fixed buy-in \(B_0\) (e.g., \$5 or \$20). To keep balance consistent across servers, define:

- **Normalized balance**: \(x = B/B_0\)

Tune most numbers as fractions of \(B_0\), not absolute dollars:

- Burn: \(Burn(B)=b_{base}\cdot B_0 + b_{wealth}\cdot B\)
- Shot costs: \(C_{shot}\in[s_{min}\cdot B_0,\, s_{max}\cdot B_0]\)
- Dash burn/sec: \(d\cdot B_0\)
- Execution: \(ExecBalance=e\cdot B_0\), \(HeavyHit=h\cdot B_0\)

This makes the “\$5 server” and “\$20 server” play the same **in relative terms** (TTK, volatility, ROI, etc.).

---

### PnL (the true win condition)

Every player’s goal is **positive PnL and a successful exit**.

- **PnL**:

\[
PnL = \frac{B - B_0}{B_0}
\]

- **Primary HUD** should always show:
  - current Balance \(B\)
  - current PnL % (e.g., +24% / −12%)
  - current burn rate (in \$ / sec)
  - exit state (idle / channeling / jammed)

Design implication:

- “Winning” a fight is not just dealing damage—it’s **securing value and living long enough to extract**.

---

### Action ledger (complete cost/reward inventory)

For each action \(a\), we track:

- **Money cost** \(\$C_a\): immediate balance reduction (value goes to Reserve)
- **Time/commitment cost** \(t_a\): time spent charging, recovering, or silenced
- **Exposure cost**: expected incoming damage while committed
- **Cooldown/silence**: inability to shoot/dash (opponent gets initiative)
- **Reward**:
  - **Damage** to enemy
  - **Displacement** (momentum/knockback)
  - **Loot access** (hot-loot exclusivity window)
  - **Tempo** (forcing enemy cooldown / stun / positional advantage)

---

### Burn system (passive + kinetic-energy-based movement burn)

We separate burn into:

- **Passive burn** (anti-camping + anti-snowball): applies even at rest.
- **Movement burn** (your request): any **intent-based movement power** from movement systems (base thrust, braking, dash charge/release) increases burn for that window, using a **kinetic energy** model based on \(v = distance / time\).

**Important exclusion**:

- Movement burn is based on **player intent** only. It does **not** include acceleration/velocity changes from:
  - recoil
  - collisions
  - being rammed
  - server correction / interpolation

Key tuning goals:

- **Anti-camping**: a player who refuses to engage must eventually die.
- **Anti-snowball**: rich players must keep earning (pellets + fights) to maintain size.
- **Not “feels-bad”**: players should be able to sustain by moving and collecting; burn should be noticeable but not suffocating.

**Burn window (“tick range”)**:

- Burn is computed and applied in discrete windows of **burnWindowSec = 0.20s**.
- Within each window we integrate movement intent (\(\tau\)) so micro-toggling can’t “hide” from costs.

**Passive burn (per second)**:

\[
Burn_{passive}(B)= (0.0025B_0) + 0.005B
\]

**Movement burn (kinetic-energy-based, per second)**:

We model movement burn as proportional to the **kinetic energy** implied by the player’s *intent* to move.

Design rationale:

- Kinetic energy is \(KE=\frac12 m v^2\), and \(v\) is literally \(distance/time\).
- We do **not** charge for “accidental” velocity from collisions/recoil; we charge for the **intended movement velocity scale** coming from base thrust, braking retro-thrust, and dash modes.

Define an **intent movement speed scale** \(\tau(t)\):

- \(\tau = 0\): coasting (no thrust intent)
- \(\tau = 1\): full base thrust intent
- \(\tau > 1\): special thrust modes (retro/brake, dash charge spool, dash boost)

**How \(\tau\) is set (explicit)**:

- **Normal thrust**: \(\tau = \|moveInput\|\) where \(\|moveInput\|\in[0,1]\) (WASD vector magnitude).
- **ShotCharging**: \(\tau = shotChargeSlowMultiplier \cdot \|moveInput\|\) (default slow multiplier 0.85).
- **Cooldown**: \(\tau = cooldownMoveMultiplier \cdot \|moveInput\|\) (default move multiplier 0.60).
- **Brake held**: \(\tau = \tau_{brake}\) (default 2.0).
- **DashCharging**: \(\tau = \tau_{dashCharge}\) (default 6.0).
- **Dash boost phase**: \(\tau = \tau_{dashBoost}\) (default 4.0).
- **ExitChanneling / OverheatStun**: \(\tau = 0\) (thrust disabled).

Convert \(\tau\) into an **intent speed** (distance/time):

\[
v_{intent}(t)= \tau(t)\cdot maxSpeedBase
\]

Within a burn window, compute \(\overline{v_{intent}^2}\) (mean of \(v_{intent}^2\) over the window). Then:

\[
Burn_{move} = (k_{thrust}\cdot B_0)\cdot \frac{\overline{v_{intent}^2}}{maxSpeedBase^2}
\]

This is equivalent to \(k_{thrust}\cdot B_0 \cdot \overline{\tau^2}\), but written explicitly in terms of \(v\) (distance/time).

With **\(k_{thrust}=0.0030\)**, sustained full base thrust at \(\tau=1\) costs **0.30% of buy-in per second**.

**Total burn applied each window**:

\[
Burn_{total} = \big(Burn_{passive}(B) + Burn_{move}\big)\cdot burnWindowSec
\]

All burn goes to **Reserve**.

---

### World units + movement spec (implementation-ready)

**Simulation rate**:

- Authoritative tick: **30Hz** (33.33ms). (Coarse enough to reduce frame-perfect abuse, still responsive with prediction.)

**World scale**:

- Recommended world bounds: **6000 × 6000 units** (works with existing infra; supports multiple concurrent fights).
- Typical duel distance (locked above): **450 units**.

**Physics mass normalization (so \$5 and \$20 servers feel the same)**:

- Economic balance is \(B\) (dollars).
- Buy-in is \(B_0\).
- **Physics mass** is normalized: \(m = B/B_0\).
- Radius uses normalized mass: \(r = r_0\cdot \sqrt{m}\).

This preserves “balance = mass” *within a server* while keeping the physical feel consistent across servers.

**Ship movement (Newtonian-ish)**:

- **Thrust** is a force, so heavier players accelerate less:
  - Full-input thrust force is tuned so that at \(m=1\), accel ≈ **900 u/s²**.
  - Therefore, at mass \(m\), accel ≈ \(900/m\) u/s².
- **Drag** is also a force, so heavier players drift more:
  - Set linear drag so that at \(m=1\), velocity decays to ~**82% per second** when no thrust.
  - At larger \(m\), decay is slower (more drift).
- **Soft speed cap**:
  - \(maxSpeedBase = 320\) units/s (comfortable piloting speed).
  - Above that, apply extra quadratic drag so burst speeds decay quickly but are possible via dash/recoil.

**Rotation (anti-bot + skill)**:

- Ship rotates toward cursor with:
  - max angular speed: **360°/s**
  - angular accel: **720°/s²**

This creates aim skill and reduces “perfect snap” bots.

---

### Environment (cover, line-of-sight, and anti-aimbot)

Top-down shooters become aimbot-favored if the map is an empty plane. We add simple static obstacles to:

- Create **line-of-sight breaks** (prediction + repositioning),
- Introduce **routing choices** (skill expression),
- Reduce “perfect tracking” advantage.

**Recommended environment spec (v8)**:

- **Obstacles**: 35–55 “asteroids” (static circles or convex blobs), radii 60–220u.
- **Placement**:
  - No obstacle within 300u of borders.
  - Avoid clustering too tightly (min center distance ≈ 250u).
- **Collision**:
  - Player bodies collide and slide along obstacles (no damage).
  - Bullets collide and despawn on obstacle hit (no heat generation).
  - Spill pellets bounce lightly and settle (so value can “land” in pockets behind cover).

---

### Camera + information (avoid information advantages)

Dynamic zoom is allowed, but must not create a “fast players see everything” dominant advantage.

**Recommended camera**:

- Base zoom corresponds to a ~**1600u × 900u** view rectangle.
- Zoom changes with speed but is capped:
  - slow: 1.00
  - fast: 0.85 (never wider than this)
- Optional: slight zoom-out with mass (rich players have more situational responsibility), capped.

---

### Complete player state machine (authoritative)

The game must be expressible as a small, explicit state machine so there are no “undefined” edge cases.

**States**:

- **Alive: Normal**
  - Can thrust, rotate, brake, collect, start shot charge, start dash charge, start exit channel.
- **Alive: ShotCharging**
  - Holding LMB; charge accumulates up to `fullChargeSec`.
  - Can thrust and rotate.
  - Recommended movement penalty: **shotChargeSlowMultiplier = 0.85** (prevents full-charge dominance).
  - On release: fires bullet; may enter Cooldown depending on charge.
- **Alive: DashCharging**
  - Holding RMB/Space; charge accumulates.
  - Movement slowed by **chargeSlowMultiplier = 0.55**.
  - Cannot shoot while dash-charging.
  - If held beyond `overheatSec`: enters OverheatStun.
  - On release (after `minChargeSec`): performs dash + i-frames; enters Cooldown.
- **Alive: Cooldown (silenced)**
  - Move speed multiplier **0.60**.
  - Cannot shoot, dash, or brake.
  - Duration scales with charge of the triggering action.
- **Alive: OverheatStun**
  - Cannot shoot/dash/brake/thrust.
  - Rotation allowed (readability), drift continues.
  - Duration: **2.0s**.
- **Alive: ExitChanneling**
  - Holding exit key (e.g., `Q`) for `channelHoldSec`.
  - Thrust disabled; cannot shoot/dash/brake.
  - Any incoming damage cancels and applies ExitJammed.
- **Alive: ExitJammed**
  - Normal movement/aim allowed, but cannot start exit for `exitJammedSec`.
- **Dead: Liquidated**
  - Entity removed after death spill is created.

**State priorities** (to avoid ambiguous inputs):

- OverheatStun > ExitChanneling > Cooldown > DashCharging > ShotCharging > Normal

---

### Actions (every possible thing a player can do)

This is the complete action set. Anything not listed is either disallowed or a cosmetic.

- **Thrust (WASD)**:
  - Applies thrust force in cardinal directions; if multiple keys held, normalize to keep constant magnitude.
- **Rotate to cursor**:
  - Rotation limited by angular accel/speed (prevents snap aim).
- **Brake (hold)**:
  - Only available in Normal/ShotCharging.
  - Applies **retro-thrust assist** (thrust direction automatically opposes velocity) so you can “stabilize.”
  - Cost is **not special-cased**: braking increases \(\tau\) and therefore increases **movement burn** for that burn window.
- **Shoot (LMB hold/release)**:
  - Only available in Normal/ShotCharging.
  - On release, fire one bullet and pay shot cost.
- **Dash (RMB/Space hold/release)**:
  - Only available in Normal.
  - While charging, you enter a high-\(\tau\) **retro-thrust spool** (slow/readable and paying movement burn).
  - On release, dash + i-frames; always triggers Cooldown.
- **Ram (collision while armed)**:
  - Only possible after dash release, within `armedWindowMs`.
  - Computes ram damage from dash stake + closing speed; applies mutual damage and stun.
- **Collect pellets**:
  - Always-on while alive: overlapping a pellet transfers its value to you (subject to hot-loot rules).
- **Exit (hold)**:
  - Only available in Normal; enters ExitChanneling.

---

### Projectiles + collisions (complete spec)

**Bullet creation**:

- Bullet is spawned at ship muzzle (front of circle along facing angle).
- Bullet world velocity:
  - \(v_{bullet} = v_{bulletBase}\cdot \hat{u} + v_{shooter}\) (full inheritance)
- Bullet is a circle collider with radius based on charge.
- Bullet lifetime:
  - Despawn after **2.5s** or on first hit.

**Collision detection**:

- Use **swept collision** (continuous) per tick so high speeds don’t tunnel.
- Server is authoritative; clients interpolate.

**Bullet damage**:

- Damage reduces victim balance immediately.
- Damage event spawns spill pellets from \(0.90D\) (tagged hot to attacker) and routes \(0.10D\) to Reserve.
- Velocity impact factor:
  - Let \(\hat{u}\) be bullet direction.
  - Let \(v_{approach} = \max(0,\ -\langle v_{victim}-v_{bullet},\hat{u}\rangle)\).
  - \(V = 1 + 0.5\cdot \min(1,\ v_{approach}/maxSpeedBase)\).

**Spill pellet motion** (anti-bot + fun):

- Spill pellets inherit victim velocity and get an impulse **away from attacker**.
- Larger hits fling value farther (harder to secure without committing position).

**Body collisions**:

- Players have physical collision.
- If not armed for ram: treat as soft collision (separate bodies with damping; no damage).

---

### Death + liquidation (complete spec)

**Liquidation trigger**:

- If \(B \le DEATH\_BALANCE\), player is dead.

**Death spill** (so kills pay out immediately):

- On death, create a “death spill” worth **100% of remaining balance** (after the lethal hit is applied).
- Tagging:
  - Tagged hot to the **killer** for `hotLootWindowSec`.
- Packaging:
  - Spawn as a small number of larger pellets (e.g., 6–18) to avoid clutter while preserving value.

---

### Shooting (investment bet)

We represent shot charge as \(c \in [0, 1]\).

- **Cost curve** (convex by default so mid-charge is affordable):

\[
C_{shot}(c)=C_{min} + (C_{max}-C_{min}) \cdot c^{\alpha}
\]

- **Damage model**:

\[
D_{shot} = C_{shot}(c) \cdot SR(c) \cdot V \cdot k_{shot}
\]

Where:

- \(SR(c)\) = spill ratio / leverage (tap → full)
- \(V\) = velocity impact factor (expected > 1 when players are moving into shots)

**Spill**:

- Spill created: \(D_{shot} \cdot \eta_{spill}\)
- Expected captured value (on hit): \(D_{shot} \cdot \eta_{spill} \cdot f_{capture}\)

**Core EV** (ignoring counter-damage for the moment):

\[
EV_{shot} = -C_{shot}(c) + P(hit)\cdot (D_{shot}\cdot \eta_{spill}\cdot f_{capture})
\]

**Break-even hit rate**:

\[
P(hit)_{BE}=\frac{C_{shot}(c)}{D_{shot}\cdot \eta_{spill}\cdot f_{capture}}
=\frac{1}{SR(c)\cdot V\cdot k_{shot}\cdot \eta_{spill}\cdot f_{capture}}
\]

This means:

- Higher \(SR\) lowers break-even accuracy.
- To avoid “always full charge,” we must ensure at least one of:
  - **\(P(hit)\) decreases** with charge (telegraph + commitment)
  - **Cycle time increases** with charge (DPS/EV per second tradeoff)
  - **Exposure increases** with charge (you get punished for charging)

---

### Dash (positioning + invulnerability, prediction-gated)

Dash has two phases:

- **Charge**:
  - You fire **retro/spool thrusters** (high \(\tau\)) which slows you and **increases movement burn** during those burn windows.
  - The integrated movement burn during charge is your **stake** \(S\) (used for ram damage).
  - You are slowed (harder to dodge → prediction penalty if you pre-charge at the wrong time).
  - **Minimum charge time** should exist to prevent reaction-dash bots.

- **Release**:
  - Enter a short **boost phase** (high \(\tau\)) for a duration that scales with charge time.
  - Grant **projectile invulnerability** for a fixed window.
  - Apply post-dash lockout (cooldown state).

**Anti-bot rule** (critical):

- **Invulnerability is allowed**, but it must be **prediction-gated**:
  - If dash can be triggered “instantly” on reaction, bots benefit too much.
  - Therefore: **minChargeSec** + visible charge cue + meaningful slow during charge.

---

### Exit (B): channel-anywhere, punishable

Exit is an **optimal stopping** decision: lock in PnL now vs press your edge.

Required properties for soundness:

- **Channel time**: exiting takes time (hold-to-exit).
- **Hard commitment** during channel:
  - Cannot shoot or dash.
  - Movement severely limited (ideally near-zero).
- **Interruptible**:
  - Taking damage or colliding with a ram cancels or resets the channel.
- **Telegraphed**:
  - Visible beacon/sound cue so the area becomes contested.

Goal: exiting positive is possible, but **not risk-free**.

**Recommended exit constants (v8)**:

- **channelHoldSec**: **3.0s**
- **movement while channeling**: thrust disabled (drift only); max steering allowed (you can rotate, but cannot meaningfully reposition)
- **actions while channeling**: cannot shoot, dash, or brake
- **interrupt rule**:
  - any incoming damage \(D>0\) cancels channel and applies **exitJammedSec = 1.5s** (cannot restart exit)
- **voluntary cancel recovery**:
  - releasing exit early applies **exitCancelRecoveryMs = 250ms** (cannot shoot/dash/exit; can still thrust + rotate)
- **telegraph**:
  - beacon ring visible to all players within **1400u** (roughly “2 screens” at mid zoom)
  - distinct audio cue that ramps with remaining hold time

Why these values:

- 3s is long enough to be contestable, short enough to be a real “cash-out” option.
- Jammed cooldown prevents spam-tapping exit to bait shots.

---

### Reserve spawn bias (C): value flows toward conflict

To prevent “PvE route → small profit → exit” from becoming dominant (and bot-friendly), we bias Reserve pellet spawning toward **heat**:

- Maintain a world “heat” field (grid or sparse map).
- Heat increases from:
  - Projectile hits (stronger weight)
  - Ram hits / kills (highest weight)
  - Large spill events
- Heat decays over time.

Reserve spawns sample from a mixture:

- **Mostly heat-weighted** (drives conflict / creates contested loot).
- **Some uniform baseline** (prevents dead zones / supports new spawns).

This makes profit structurally tied to **risk + interaction**.

**Recommended heat + spawn constants (v8)**:

- **Heat grid cell size**: **300u**
- **Heat half-life**: **12s** (decays exponentially)
- **Heat sources**:
  - projectile hit: +\(1.0 \cdot D\) × pairMultiplier(attacker,victim)
  - ram hit: +\(1.8 \cdot D\) × pairMultiplier(attacker,victim)
  - liquidation (death): +\(0.5 \cdot B_0\)
- **Reserve “release” rule** (prevents safe low-player farming):
  - define **ambientPelletValueTarget = alivePlayers \(\cdot 0.8B_0\)**
  - Reserve only spawns until ambient pellets in world reach this target (spill pellets do **not** count toward the target)
  - if **global heat is low** (below a threshold), only release **25%** of the computed spawn (store the rest in Reserve)
- **Spawn distribution**:
  - **80% heat-weighted** (sample cells proportional to \(heat^{1.2}\))
  - **20% baseline** (uniform random, but never within 250u of an exiting player)
- **Pellet sizing** (clutter control without deleting value):
  - spawn fewer, larger pellets: target **pelletValue ≈ 0.02B_0** each
  - clamp pellet count per second to avoid floods; excess value is stored in Reserve for later ticks

Why these values:

- Heat half-life 12s keeps fights “sticky” (value keeps spawning near the action) but doesn’t lock the whole match to one hotspot.
- The ambient target ensures the map is playable, while the low-heat throttling prevents “empty lobby PvE profit → exit” as a dominant bot strategy.

**Pairwise diminishing returns (anti-collusion)**:

To prevent two accounts from farming heat safely by repeatedly tapping each other:

- Maintain a rolling 12s window of damage \(D_{pair}\) from attacker→victim.
- Define:

\[
pairMultiplier = \frac{1}{1 + (D_{pair} / (0.35B_0))}
\]

So:

- First ~0.35\(B_0\) of damage between a pair counts ~50–100% toward heat.
- Continued damage between the same two players rapidly stops being an efficient way to attract Reserve spawns.

---

### Tactical cooldown (silence/slow)

Power actions impose a state:

- **Move speed multiplier** (e.g., 0.6x)
- **Cannot shoot or dash**
- **Duration scales with charge**

This is the primary “risk” lever beyond pure money.

**Combo reset**:

- Resetting cooldown to 0 on *any* ram hit risks a dominant chain.
- Preferred: **partial refund** (e.g., reduce cooldown by X ms), or **reset only on kill**.

---

### Ramming (melee investment)

To keep ramming **game-theoretically sound** and not purely “rich wins,” ram damage must be tied to an **investment** and/or meaningful **self-risk**.

Recommended v8 direction:

- Ram is only “armed” for a short window after dash release.
- Ram damage is based on:
  - **Dash stake** \(S\) (money spent while charging dash), and
  - **Closing speed** (prediction + positioning)
  - With **mutual damage** (attacker pays risk)

This makes ramming a true “all-in” read, not a free delete button for big balances.

---

### Execution (low-balance finisher)

Execution is good for clarity/tension, but must avoid being “cheaply triggered.”

- If \(B < EXEC\_THRESHOLD\) and takes \(D > HEAVY\_HIT\), then liquidation.
- Telegraphed visually (everyone can see execute range).

**Scaling requirement**:

- \(EXEC\_THRESHOLD\) and \(HEAVY\_HIT\) should be defined as **fractions of buy-in** \(B_0\), not absolute dollars.

---

### Braking (retro-thrust control)
Braking is implemented via **movement burn** (no separate pricing):

- Holding brake increases \(\tau\) (you fire retro thrusters), which increases movement burn during those windows.
- Recommended brake utilization: **\(\tau_{brake}=2.0\)**.

This preserves “stabilize to aim” as a meaningful bet without a special-case dollar drain.

---

### Bot advantage controls (design-level)

We explicitly want a shooter that rewards **aim + prediction** while minimizing frame-perfect abuse.

- **No hitscan**: bullets have meaningful flight time.
- **Commitment windows**: charge times + lockouts prevent purely reactive play.
- **Prediction gating for i-frames**: min dash charge time + telegraph.
- **Server authority + coarse tick**: authoritative collisions and damage (client can’t “thread the needle”).
- **Readable telegraphs**: humans can outplay via anticipation (not reflex-only).

---

### v8 draft parameter pack (implementation-ready)

All values below are expressed as either:

- **Fractions of buy-in** \(B_0\) (so \$5 and \$20 servers behave the same), or
- **Fixed time windows** (seconds/ms), or
- **World-units** (for geometry/speeds).

These are “best starting values” for your stated goals: **TTK≈10s**, prediction-heavy bullets (0.8s TOF), punishable exits (B), and heat-biased Reserve spawns (C).

- **Economy**
  - **baseTaxPerSec**: \(0.0025\cdot B_0\)  (e.g., \$0.05/s at \$20 buy-in)
  - **wealthTaxRatePerSec**: **0.005** (0.5% of current balance per second)
  - **burnWindowSec**: **0.20s**
  - **movementBurnCoeff** \(k_{thrust}\): **0.0030** (per sec at \(\tau=1\); KE-scaled via \(v_{intent}^2\))
  - **spillEfficiency** \(\eta_{spill}\): 0.90
  - **hotLootWindowSec**: 1.5
  - **capture model (design)**:
    - Close (≤200u): attacker captures ~70–80% of spill on average
    - Typical duel (450u): ~55–65%
    - Long (≥900u): ~25–40%

- **Shooting**
  - **fullChargeSec**: 0.8
  - **costMin**: \(0.005\cdot B_0\)
  - **costMax**: \(0.08\cdot B_0\)
  - **costCurveExp** \(\alpha\): 2.0 (convex)
  - **spillRatioMin**: 4.0
  - **spillRatioMax**: 10.0
  - **spillRatioCurveExp**: 1.0 (linear)
  - **velocityImpactExpected** \(V\): 1.10
  - **damageScale** \(k_{shot}\): **0.62** (primary knob to hold TTK≈10s)
  - **tapIntervalMs**: 220
  - **cooldownChargeThreshold**: 0.30
  - **cooldownMinMs**: 120
  - **cooldownMaxMs**: 900
  - **bullet speed**:
    - \(v_{bulletBase} = ENGAGEMENT\_RANGE / 0.8 = 562.5\) units/s (round to **560**)
    - Bullet inherits **100% of shooter velocity** (Newtonian; adds depth)
  - **bullet radius (hitbox)**:
    - tap: **10u**
    - full: **28u**
    - scales linearly with charge
  - **recoil** (mass-aware):
    - define the “recoil at \(m=1\)” as:
      - \(\Delta v_{recoil,m=1} = 520 \cdot (C_{shot}/(0.08B_0))\)
    - apply mass:
      - \(\Delta v_{recoil} = \Delta v_{recoil,m=1} / m\)

- **Dash**
  - **minChargeSec**: 0.18 (prediction gate)
  - **chargeSlowMultiplier**: 0.55
  - **overheatSec**: 2.5
  - **selfStunMsOnOverheat**: 2000
  - **projectileInvulnMs**: 400
  - **base thrust utilization**: \(\tau_{base}=1.0\)
  - **brake thrust utilization**: \(\tau_{brake}=2.0\)
  - **movement intent scale during dash charge (spool)**: **\(\tau_{dashCharge}=6.0\)** (expensive by design; this is the main dash bet)
  - **movement intent scale during dash boost**: **\(\tau_{dashBoost}=4.0\)** for a duration that scales with charge
  - **dash boost duration (scales with charge)**:
    - let \(t\) be dash charge time clamped to \([minChargeSec,\ 1.20s]\)
    - \(boostDurationSec = 0.18 + 0.14\cdot \frac{t-minChargeSec}{1.20-minChargeSec}\)  (so 0.18s → 0.32s)
  - **dash speed gain (emergent from the same thrust physics as base movement)**:
    - at \(m=1\), boost-phase Δv is approximately:
      - \(\Delta v_{dash,m=1} \approx (900)\cdot \tau_{dashBoost}\cdot boostDurationSec\)
    - apply mass:
      - \(\Delta v_{dash} \approx \Delta v_{dash,m=1}/m\)
  - **dash stake (used for ram damage)**:
    - stake is the **movement burn spent during DashCharging**, excluding passive burn:
      - \(S = (k_{thrust}\cdot B_0)\cdot \tau_{dashCharge}^2 \cdot t_{charge}\)
  - **post-dash lockout**:
    - always triggers cooldown state (same scaling rules as shooting based on charge fraction)

- **Ram (proposal)**
  - **armedWindowMs**: 650
  - **ramSpillRatio**: 10.0
  - **damageScale** \(k_{ram}\): **0.18** (keeps max-stake ram from one-shotting a full-health target)
  - **selfDamageFrac**: 0.25
  - **victimStunMs**: 800
  - **cooldownRefundOnHitMs**: 350 (not full reset)
  - **ram damage**:
    - closing speed \(v_{close}\) projected onto collision normal (0 if glancing)
    - \(V_{ram}=1.0 + 0.5\cdot \min(1,\ v_{close}/maxSpeedBase)\)
    - \(D_{ram}= S \cdot ramSpillRatio \cdot V_{ram} \cdot k_{ram}\)
    - attacker takes \(0.25\cdot D_{ram}\) immediately (plus they already paid stake \(S\))

---

### Chosen defaults (no remaining spec holes)

- **Spill motion**:
  - on hit, spill pellets inherit victim velocity + get an impulse **away from attacker**
  - impulse magnitude: **220–800u/s** scaling with damage (bigger hits fling money farther)
- **Execution constants**:
  - \(EXEC\_THRESHOLD = 0.30\cdot B_0\)
  - \(HEAVY\_HIT = 0.12\cdot B_0\)

---

### Cooldown function (explicit)

To remove ambiguity, cooldown duration is defined as a function of “power” \(p\in[0,1]\).

- For **shots**: \(p = c\) (shot charge fraction).
- For **dashes**: \(p = \min(1,\ t_{charge}/overheatSec)\), but **clamped up** so every dash has a lockout:
  - \(p_{dash} = \max(0.30,\ p)\)

Cooldown:

- If \(p \le 0.30\): no cooldown (**shots only**; dashes use \(p_{dash}\)).
- Else:

\[
cooldownMs = cooldownMinMs + (cooldownMaxMs - cooldownMinMs)\cdot \Big(\frac{p-0.30}{0.70}\Big)^{1.2}
\]

This makes medium actions tolerable and max-power actions meaningfully punishable.

---

### TTK calibration (why these numbers hit ~10s)

TTK depends on hit rate and charge choices. The goal is:

- At **typical duel range (450u)**, a competent player who mixes medium charges and occasional punish shots should be able to secure a kill in **~10s**.
- Tap-only should **not** be a fast-kill strategy (it’s pressure/spacing).

Using the shot model with \(V=1.10\) and \(k_{shot}=0.62\):

- **Tap (c≈0)**:
  - Damage per hit ≈ \(0.0136B_0\)
  - At 100% hits and 220ms cadence: DPS ≈ \(0.062B_0/s\) ⇒ TTK ≈ 16s
  - In practice (lower hit %), tap is slower ⇒ good for poke, not deletion.

- **Medium charge (c=0.5)**:
  - Cost \(C≈0.02375B_0\), spill ratio \(SR=7\)
  - Damage per hit ≈ \(0.113B_0\)
  - Cooldown at c=0.5 ≈ 340ms; cycle time ≈ 0.4s charge + 0.34s cooldown ≈ 0.74s
  - At ~65% hit rate: DPS ≈ \(0.113 \cdot 0.65 / 0.74 ≈ 0.099B_0/s\) ⇒ **TTK ≈ 10.1s**

- **Full charge (c=1.0)**:
  - Damage per hit ≈ \(0.546B_0\)
  - Cycle time ≈ 0.8s + 0.9s ≈ 1.7s
  - Requires lower hit rate to matter, but is heavily punishable and intended as a punish/finisher.

If real playtests show TTK drifting, tune **only**:

- \(k_{shot}\) (primary), and optionally
- cooldown curve exponent (secondary).

---

### Movement economy calibration (what the new movement burn implies)

With \(k_{thrust}=0.0030\), movement burn rates (excluding passive burn) are:

- Recall \(v_{intent}=\tau\cdot maxSpeedBase\), so these costs scale with **\(v_{intent}^2\)** (kinetic-energy-style) rather than linearly.

- **Coast** (\(\tau=0\)): 0
- **Full base thrust** (\(\tau=1\)): **0.30% of \(B_0\) per second**
- **Brake** (\(\tau=2\)): **1.20% of \(B_0\) per second**
- **Dash charge** (\(\tau=6\)): **10.8% of \(B_0\) per second** (matches the original “~\$2/sec on a \$20 server” intent)
- **Dash boost** (\(\tau=4\)): **4.8% of \(B_0\) per second**, but only for ~0.18–0.32s

This achieves the design goal:

- Normal navigation is affordable.
- Micro-stabilization is a real bet.
- Dash is a major bet (and therefore not spammable) while keeping i-frames.

---

### Bot advantage audit (explicit)

We can’t “ban bots with design,” but we can ensure bots do not get *outsized* advantage from frame-perfect reaction.

- **Aimbot (perfect leading)**
  - **Bot edge**: compute leads precisely.
  - **Mitigation**: rotation rate limits + bullet travel time + obstacles/LoS breaks + hot-loot capture requiring positioning (aim alone isn’t profit).

- **Reaction dash (i-frame timing)**
  - **Bot edge**: dash exactly on bullet spawn.
  - **Mitigation**: `minChargeSec` gate + charge slow + post-dash lockout (reaction is too late; must pre-commit).

- **Perfect pellet routing (PvE bot)**
  - **Bot edge**: optimal pathing in cold areas.
  - **Mitigation**: C (heat-biased Reserve) + cold-world throttle + punishable exit; profit requires contested zones.

- **Exit timing bot**
  - **Bot edge**: exit at mathematically optimal moment.
  - **Mitigation**: exit is a public, punishable commitment (beacon + interrupt + jam); “optimal moment” still requires reading opponents.

- **Ram intercept bot**
  - **Bot edge**: compute intercept trajectories.
  - **Mitigation**: stake cost + self-damage + armed window + cover; missing is expensive; rams aren’t free wins.


### “Ready to implement?” checklist

The design is implementable once these are pinned:

- **Units**: world units scale, typical fight distance, base move accel/friction, dash impulse.
- **Projectile spec**: bullet radius vs charge, TOF=0.8s at typical distance, collision rules.
- **Action state machine**: charge → release → lockout for shoot/dash; what interrupts what.
- **Ram spec**: damage function \(D_{ram}(S, v_{close})\), self-damage fraction, armed window.
- **Exit spec**: channel duration, interrupt rules, telegraph, any scaling with balance.
- **Reserve spawn spec (heat)**: heat sources/weights, decay, spawn sampling mix (heat vs uniform), anti-exploit rules.

---

### Strategy space (complete taxonomy) + counters

“All possible strategies” is infinite, but it decomposes into a finite set of strategic *families*. Below is the complete taxonomy you must balance.

#### Macro / economic strategies

- **S1: Cold farmer (“rat”)**
  - **Plan**: avoid combat, collect baseline pellets, exit small positive.
  - **Countermeasure** (must hold): cold pellet income < burn, and Reserve releases are throttled when heat is low.
- **S2: Heat surfer**
  - **Plan**: orbit active fights to capture heat-biased Reserve pellets + leftovers.
  - **Counterplay**: vulnerable to being targeted; heat areas are contested; large pellets fling far; exit beacons attract predators.
- **S3: Vulture / third-party**
  - **Plan**: arrive after hot-loot expires, steal neutral spill.
  - **Counterplay**: hot-loot window lets attacker secure value if they commit; vultures expose themselves to both sides.
- **S4: Whale hunting**
  - **Plan**: hunt high-balance players because burn pressures them and they’re big targets.
  - **Counterplay**: whales can afford stake-based threats (dash/ram), and may have better area control.
- **S5: Early cash-out**
  - **Plan**: exit at +10–30% PnL quickly, avoid compounding risk.
  - **Counterplay**: exit is punishable (3s channel + beacon + jam); frequent exits reduce time-in-world opportunity.
- **S6: Compounding (“press edge”)**
  - **Plan**: stay longer at high balance to capture more spill and dominate heat zones.
  - **Counterplay**: higher burn; larger hitbox; slower accel/turn due to mass.

#### Combat / micro strategies

- **S7: Tap pressure**
  - **Plan**: cheap shots to force dash usage and create small spill you can secure.
  - **Counterplay**: tap has high break-even accuracy requirement at range; bots can’t “print” unless they can also secure loot.
- **S8: Charged punish**
  - **Plan**: hold charge to punish exit channels, dash releases, or braking.
  - **Counterplay**: charge is telegraphed; you are slowed; you can be rushed or forced to fire early.
- **S9: Dash dodge (i-frame timing)**
  - **Plan**: pre-charge dash to cover predicted incoming shot.
  - **Counterplay**: min charge time + slow makes pre-charging a commitment that can be baited.
- **S10: Dash reposition / loot secure**
  - **Plan**: use i-frames to cross into spill and bank it quickly.
  - **Counterplay**: post-dash lockout prevents immediate follow-up; you can be punished after i-frames end.
- **S11: Stake ram all-in**
  - **Plan**: charge dash longer to increase stake, then collide to burst + stun.
  - **Counterplay**: expensive, punishable, self-damage; if whiffed you enter cooldown and can be farmed.
- **S12: Recoil mobility**
  - **Plan**: use shot recoil to create bursts, angle changes, and spacing.
  - **Counterplay**: recoil is predictable; heavy players get less Δv; firing costs money.
- **S13: Brake-peek**
  - **Plan**: pay to brake, stabilize aim, then punish with a shot.
  - **Counterplay**: braking increases movement burn (\(\tau_{brake}\)); braking while charged is telegraphed; you can be rushed.

#### Exit / deception strategies

- **S14: Exit bait**
  - **Plan**: begin exit to draw predators, cancel, and punish.
  - **Counterplay**: while channeling you are helpless; canceling should have a short recovery; taking any damage jams exit attempts.
- **S15: Exit hunter**
  - **Plan**: respond to exit beacons to secure kills and/or steal spill.
  - **Counterplay**: exit can be attempted after clearing an area; exit hunters create heat and attract third parties.

#### Adversarial strategies (must be non-dominant)

- **S16: Collusive heat farming**
  - **Plan**: two players trade tiny hits to inflate heat and farm Reserve spawns safely.
  - **Mitigation (required)**:
    - **pairwise diminishing returns**: heat contribution from the same attacker→victim pair is multiplied by a factor that decays with repeated hits in a short window.
    - heat is still visible via resulting pellet spawns (attracts outsiders).
- **S17: Self-refund loops**
  - **Plan**: spend money (shoot/brake) to push value to Reserve, then reclaim it risk-free.
  - **Mitigation (required)**:
    - Reserve spawns are **not localized** to spender; they’re mostly heat-biased and partially uniform.
    - Cold-world throttle prevents easy “private reclaim.”

---

### Dominant-strategy audit (things that commonly break games)

For each candidate degeneracy, we list the rule that prevents it. If any row fails in playtests, you adjust the specified lever.

- **D1: PvE-only profit loop (bot-friendly)**  
  - **Failure mode**: optimal strategy becomes “route pellets, never fight, exit.”  
  - **Prevented by**: C (heat-weighted Reserve) + cold-world throttle + exit punish.
- **D2: Reaction dash i-frame bots**  
  - **Failure mode**: bots dash on bullet spawn and become unhittable.  
  - **Prevented by**: dash `minChargeSec` + charge slow + post-dash lockout.
- **D3: Infinite dash/ram chains**  
  - **Failure mode**: one ram hit enables endless mobility and stunlock.  
  - **Prevented by**: self-damage + armed window + partial cooldown refund (never full reset).
- **D4: Full-charge always optimal**  
  - **Failure mode**: players only full-charge because EV dominates.  
  - **Prevented by**: shot charge slow + longer cycle time + cooldown scaling + punish windows.
- **D5: Tap spam always optimal**  
  - **Failure mode**: players spam low-cost shots constantly, turning game into noise.  
  - **Prevented by**: tap interval + low SR at tap + high break-even accuracy at range.
- **D6: Brake stutter-step (bot micro advantage)**  
  - **Failure mode**: free braking enables perfect micro and dodging.  
  - **Prevented by**: movement burn (kinetic-energy tax) + brake disabled in cooldown.
- **D7: Exit spam to scout/bait risk-free**  
  - **Failure mode**: exit key becomes a free beacon tool.  
  - **Prevented by**: helplessness while channeling + jam on damage + (recommended) cancel recovery.
- **D8: Spawn killing**  
  - **Failure mode**: new spawns die instantly; feels unfair for real money.  
  - **Prevented by**: spawn placement away from players/heat + short spawn shield (see below).

---

### Spawn rules (must exist for real-money fairness)

**Spawn placement**:

- Sample positions until:
  - distance ≥ **1200u** from any living player, and
  - local heat below threshold (avoid active fights), and
  - not within 900u of an exit beacon

**Spawn shield**:

- On spawn, grant **spawnShieldMs = 900ms** of projectile immunity.
- While shielded:
  - cannot exit
  - cannot dash
  - can move + rotate

This prevents “spawn, instantly die” while still allowing hunting and not creating safe camping.

---

### “Perfect” isn’t a promise — but “auditable and stable” is

No competitive PvP economy is literally perfect; what we can do is make it **auditable** and hard to break:

- Every action has explicit costs, commitments, and counters.
- Every dominant-strategy candidate is paired with a single tuning lever.
- The macro loop (PnL + exit) is anchored by B + C so profit requires interaction.

---

### Balance acceptance tests (design-level “must pass”)

These are the end-to-end properties that make the game “sound.” You can implement these as automated sims later, but they are defined here as acceptance criteria.

- **T0: Conservation**
  - Between deposit/exit events:  
    \( \sum PlayerBalance + \sum PelletValue + Reserve = constant\)

- **T1: No self-arbitrage**
  - In an empty world (no other players), any sequence of shoot/dash/brake actions cannot increase your expected Balance above what you’d have by not acting (ignoring randomness of pellet spawn locations).

- **T2: Cold farming is negative EV**
  - In low-heat conditions, even perfect pellet routing should not sustainably out-earn burn for long enough to reliably exit positive.
  - If this fails: increase cold throttle or reduce baseline spawn share.

- **T3: Hot play enables profit, but is contestable**
  - In high-heat areas, skilled play can net positive PnL, but the strategy must expose the player to combat (no safe “infinite ATM”).

- **T4: Exit is a real commitment**
  - Exit channeling must be interruptible, telegraphed, and punishable; exit baiting must have a cost (cancel recovery + jam).

- **T5: No single-button dominance**
  - “Always dash” fails (too expensive + lockout).
  - “Always full charge” fails (punishable + slow + lockout).
  - “Always tap” fails (slow kill + low ROI at range).
  - “Always ram” fails (expensive + self-damage + miss punish).

- **T6: Bots don’t get a qualitative edge from timing**
  - Any advantage from perfect timing must be bounded by money cost + lockout + positional requirements (loot capture), so gameplay remains strategic for humans.

---

### Focused pass: parameter sensitivity (the 3 knobs that move the meta)

If you change everything at once, you can’t reason about EV. The meta is dominated by a small set of parameters; tune these first and keep the rest fixed.

#### Knob 1 — **Reserve spawn policy (C)**

**What it controls**: whether the dominant path to profit is **combat** or **safe routing**.

- **Primary levers**:
  - heat-weighted share (default **80%**)
  - cold-world throttle (default **25%** release)
  - ambientPelletValueTarget (default **0.8B₀ per alive player**)
  - heat half-life (default **12s**)

**Safe ranges**:

- heat share: **70–90%**
- cold throttle: **15–40%**
- ambient target: **0.6–1.0×** \(B_0\) per alive player
- half-life: **8–18s**

**Symptoms**:

- Too PvE: cold farming becomes reliable → increase heat share and/or cold throttle.
- Too brawl: map feels empty outside hotspots → increase baseline share and/or ambient target.

#### Knob 2 — **Movement burn coefficient \(k_{thrust}\)** (your KE-cost unifier)

**What it controls**: the price of motion, micro-corrections, chasing, and “always-on” pressure.

- Default: **0.0030**
- Safe range: **0.0020–0.0045**

**Symptoms**:

- Too low: constant thrust/brake micro is cheap; bots benefit; fights become endless orbiting.
- Too high: players freeze/coast excessively; chasing feels impossible; exiting becomes too attractive early.

**Note**:

- Dash economics are mostly controlled by \(\tau_{dashCharge}\) (default **6.0**) because movement burn scales with \(\tau^2\) (i.e., with \(v_{intent}^2\)).

#### Knob 3 — **Dash gate + lockout (bot advantage + tempo)**

**What it controls**: whether dash i-frames are a **read** or a **reaction**.

- Primary levers:
  - `minChargeSec` (default **0.18s**)
  - `projectileInvulnMs` (default **400ms**)
  - cooldown curve (min/max, exponent)
  - \(\tau_{dashCharge}\), \(\tau_{dashBoost}\), boostDuration range (how expensive/committal dashes feel)

**Safe ranges**:

- minChargeSec: **0.16–0.24s**
- invuln: **320–450ms**
- cooldownMaxMs: **750–1100ms**

**Symptoms**:

- Too strong: nobody can finish kills; fights stall; exit becomes common.
- Too weak: players get deleted before they can respond; feels unfair for real money.

#### After those three: TTK knob (last)

Once macro (C) + motion economy (k_thrust) + dash tempo are stable, tune only:

- **shot damage scale** \(k_{shot}\) (default **0.62**, safe range **0.55–0.70**)

Goal: keep **TTK≈10s at typical duel range** for competent players, without turning full-charge into the only correct answer.




