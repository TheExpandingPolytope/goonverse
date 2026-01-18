### Game Theory & Design Solutions (Mapped to Concerns)

This doc proposes **solutions/mitigations** for each item in `poc/GAME_THEORY_DESIGN_CONCERNS.md`.

Legend:
- **[Implemented]**: already in the PoC codebase
- **[Planned]**: next iteration / straightforward to implement now
- **[Later]**: likely needed for ~100-player servers / needs netcode + telemetry

---

### 1) Shoot Spam Meta (volume-of-fire dominates)

**Primary mitigations**
- **Velocity-scaled bullets**: low-cost shots are slightly slower, charged shots faster (capped). **[Implemented]**
- **Velocity inheritance**: bullets inherit 50% of shooter velocity (feels natural when moving). **[Implemented]**
- **Minimum fire cooldown**: 400ms floor between shots (max ~2.5 shots/sec). **[Implemented]**
- **Strong recoil**: each shot pushes shooter backward; spam = constant loss of ground. **[Implemented]**
- **Range-scaled exit contestability**: exit progress rewind scales with damage, not hit count. **[Implemented]**

**Secondary mitigations (if spam still dominates after testing)**
- **Shooting commitment**: reduced mobility while charging (40% speed) + after shooting (50% speed for 400ms). **[Implemented]**
- **Velocity cut on shoot**: shooting instantly cuts current velocity by 50%. **[Implemented]**
- **Dash cancellation**: shooting mid-dash cancels the dash. **[Implemented]**
- **Soft aim tax**: low-charge bullets have slight spread / bloom. **[Planned]**
- **Anti-zoning decay**: bullets lose damage/rewind potency with distance traveled. **[Planned]**
- **Heat mechanic**: continuous firing increases cost or cooldown. **[Later]**

---

### 2) Charged-Shot Dominance (only big shots matter)

**Mitigations**
- **Charge exposes you**: slower movement / larger hitbox / louder sound while charging. **[Planned]**
- **Miss penalty scales**: high-charge misses meaningfully cost you time/position (e.g., higher cooldown). **[Planned]**
- **Hard cap on “reliability”**: clamp bullet speed + size so charged shots are not semi-hitscan. **[Planned]**
- **Counterplay windows**: short telegraph (flash/beam) before release. **[Planned]**

---

### 3) Dash-First / Stun Loop Meta (dash replaces everything)

**Mitigations**
- **Dash is commit**: after dash impact, apply brief self-slow (“recovery”) or disable immediate re-dash. **[Planned]**
- **Diminishing stun**: repeated stuns on same target within N seconds reduce duration. **[Later]**
- **Dash cost scaling**: successive dashes increase cost temporarily (anti-loop). **[Later]**
- **More anti-dash geometry**: terrain that blocks dash lines, not just bounces. **[Later]**

---

### 4) Exit Denial / “Crab Bucket”

**Mitigations**
- **Damage rewinds progress instead of hard reset**. **[Implemented]**
- **Dash-stun is the hard cancel (commitment-based)**. **[Implemented]**
- **Exit beacon**: contestability scales with wealth; exiting becomes a public signal. **[Implemented]**
- **(Optional)** only allow starting exit if no enemy within R. **[Later]**

---

### 5) Scalping / Hit-and-Run Extraction (short sessions dominate)

**Mitigations**
- **Entry friction**: small “time-to-profitable” curve so instant exit isn’t best EV (e.g., early burn grace, or exit fee). **[Later]**
- **Floor profit tax**: exiting very early pays a small fee to reserve (discourages pure scalping). **[Later]**
- **Heat on re-entry**: repeated quick re-entries reduce expected value. **[Later]**

---

### 6) Vulture / Third-Party Looting

**Mitigations**
- **Ownership windows / locks**: short-time priority to the damage dealer / killer. **[Implemented (partial)]**
- **Assist credit**: split spill ownership by damage contribution (not just last hit). **[Planned]**
- **Fight-locality rewards**: “combatants” get higher magnetism to nearby spill they caused. **[Later]**
- **Anti-third-party beacon**: fights create a localized ping; helps fairness but can also attract—must tune carefully. **[Later]**

---

### 7) Kill Steal vs Damage Attribution

**Mitigations**
- **Damage ledger** per target: track contributors over last N seconds. **[Later]**
- **Split spill**: allocate fractions of spill to top contributors (ownership locks per contributor). **[Later]**
- **Assist payouts**: last hit gets a bonus, but not the entire value. **[Later]**

---

### 8) Public-Good Free-Rider Dynamic (reserve-funded pellets)

**Mitigations**
- **Local reserve**: pellets spawned near where money was paid/burned (regional economy). **[Later]**
- **Personal “rebate”**: portion of your spend becomes claimable by you (anti-free-ride). **[Later]**
- **Pellet scarcity tuning**: ensure pellet EV doesn’t exceed PvP EV. **[Planned]**

**Note**
- We already fixed **conservation** so we can reason about EV accurately. **[Implemented]**

---

### 9) Rich Target “Pinata” Dynamics

**Mitigations**
- **Wealth burn creates pressure to exit** (already). **[Implemented]**
- **Exit beacon scales with wealth** (already). **[Implemented]**
- **Clamp size and mobility extremes** so rich players aren’t “giant slow targets.” **[Implemented]**
- **(Optional)** temporary “cashout shield” that reduces chip harassment but not committed denial. **[Later]**

---

### 10) Terrain / Obstacle Camping

**Mitigations**
- **Burn/tax pressure** discourages long camping by making time expensive. **[Implemented]**
- **Dynamic map**: obstacles drift/rotate or spawn shifts. **[Implemented (rotation), Later (drift)]**
- **(Optional) Anti-camp pressure**: zone-based burn or roaming hazards if camping still dominates at 100 players. **[Later]**
- **Spawn value distribution**: ensure value isn’t concentrated at campable choke points. **[Later]**

---

### 11) Soft Collusion / Teaming

**Mitigations**
- **Diminishing returns on repeated transfers** between same pair (anti-wintrade). **[Later]**
- **Suspicion scoring** (server-side): unusually low damage between two players, proximity patterns. **[Later]**
- **Game-mode approach**: accept teaming as feature, or support squads. **[Product decision]**

---

### 12) Alt-Feeding / Bankroll Transfer

**Mitigations**
- **Rate limits**: cannot repeatedly farm the same account for full EV. **[Later]**
- **Account-level constraints**: matchmaking, identity/anti-sybil checks. **[Later/Product]**

---

### 13) Spawn & Re-entry Punishment

**Mitigations**
- **Spawn safety bubble**: invuln + cannot shoot/dash until you move. **[Planned]**
- **Spawn selection**: far from enemies / near low-value pellets to stabilize. **[Later]**
- **Grace exit**: allow immediate exit for first N seconds after entry (anti-feels-bad). **[Later]**

---

### 14) Variance Extremes (too swingy or too grindy)

**Mitigations**
- **Damage cap per tick** (prevents one-shot deletes). **[Later]**
- **Rebalance multipliers**: adjust `spillRatioMin/Max`, stun duration, and bullet speed. **[Planned]**
- **Value compression**: fewer but more meaningful pickups; less clutter. **[Implemented]**
  - Consolidated spills: 1-3 big drops instead of 10+ tiny ones
  - Increased shot cost: $1.50 min (fewer bullets = each matters)
  - Attacker magnet boost: 2.5x magnetism for 1s after dealing damage

---

### 15) Information / Targeting Externalities

**Mitigations**
- **Approximate wealth display** (bands) instead of exact. **[Later]**
- **Exit beacon as primary “target signal”** instead of always-on wealth visibility. **[Implemented/Planned]**

---

### 16) Tick/Netcode Sensitivity

**Mitigations**
- **Hitbox forgiveness**: avoid pixel-perfect; keep bullets slightly generous. **[Design]**
- **Server reconciliation** + lag compensation; keep projectiles not-too-fast. **[Later]**

---

### 17) Audio/FX Spam as Competitive Advantage

**Mitigations**
- **Distance falloff** for non-local events (audio + shake). **[Implemented]**
- **Rate limit** per sound type per client (mixing/compression). **[Later]**
- **Prioritize local**: own damage/actions are strongest. **[Implemented]**

---

### 18) Time Horizon Mismatch (optimal match length collapses)

**Mitigations**
- **Pacing knobs**: burn rate, pellet availability, and exit reliability determine session length. **[Ongoing]**
- **Dynamic events**: periodic “high value” moments to create midgame arcs. **[Later]**

