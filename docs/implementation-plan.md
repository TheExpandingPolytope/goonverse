# Implementation Plan — Agar FFA -> Shooter (Production)

This plan converts the current agar-style runtime (`packages/server/src/rooms/sim` + client world renderer) into the canonical shooter architecture defined in `docs/game-architecture.md`. It is structured as a deployment-ready sequence of milestones with explicit deliverables and gates.

---

## Goals (must ship)

- Replace agar mechanics with the shooter simulation (dash, shoot, bullets, exit channel).
- Preserve ledger-backed economy and exit ticket flow.
- Maintain determinism and 100 CCU performance guarantees.
- Deliver compatible client experience (input + renderer + HUD) with authoritative server outcomes.
- No contract/indexer changes.

## Non-goals (explicitly deferred)

- Ranked match-making, MMR, parties, or social features.
- New on-chain contract changes.
- Client-side prediction (beyond cosmetic effects).

## Current baseline (what exists today)

- Server: `GameRoom` + `FfaEngine` (agar rules) with `world:init` and `world:delta`.
- Client: agar input (mouse + Q/Space/W), blob renderer, and delta adapter.
- Ledger: deposit -> spawn credits, pellet budget transfers, exit ticket issuance.

## Migration strategy (safe rollout)

- Build a **new shooter engine** alongside `FfaEngine`, behind a server toggle (config flag).
- Use a **protocolVersion bump** to prevent old clients from joining shooter rooms.
- Keep `world:init` / `world:delta` transport but switch DTOs to shooter nodes.
- **Cutover is shooter-only** (no parallel agar rooms).

---

## Phase 0 — Foundations (week 0)

**Deliverables**
- Consolidate shooter constants into `packages/server/src/rooms/sim/config.ts` (PoC parity defaults).
- Add fixed-point mass utilities in `packages/server/src/rooms/sim/math.ts` (MASS_SCALE, rounding rules).
- Add deterministic RNG helper `packages/server/src/rooms/sim/rng.ts`.

**Implementation notes**
- Use the mass/wei conversion rules from `docs/game-architecture.md`.
- Keep all gameplay values as integer mass units; only convert for client UI and ledger transfers.

**Exit criteria**
- All constants compile and are used in sim tests.
- Unit tests for conversion rounding and deterministic RNG.

---

## Phase 1 — Authoritative simulation rewrite (server)

**Deliverables**
- New state types in `packages/server/src/rooms/sim/state.ts`:
  - Player, Bullet, Pickup (pellet/spill), Obstacle, World.
- New engine entrypoint `packages/server/src/rooms/sim/engine.ts`:
  - `GameEngine.step()` executes the canonical tick pipeline.
- New systems in `packages/server/src/rooms/sim/systems/`:
  - `input.ts`, `movement.ts`, `dash.ts`, `shooting.ts`, `bullets.ts`,
    `collisions.ts`, `economy.ts`, `spawns.ts`, `cleanup.ts`.
- Spatial hashing (`packages/server/src/rooms/sim/spatial/grid.ts`) for collisions + interest.

**Key rules to implement**
- Deterministic hit resolution order and post-stun grace window.
- Swept collision checks for bullets and dash movement.
- Consolidated spill drops (1–3) + hard caps per tick.
- Exit hold progress + damage rewind + anti-grief boost.

**Exit criteria**
- Engine produces deterministic outcomes in unit tests.
- No wall clock usage in sim; all timing is tick-based.

---

## Phase 2 — Room integration + protocol

**Deliverables**
- New protocol spec in `packages/server/src/rooms/protocol.ts`:
  - `protocolVersion`, `InputMessage`, `WorldInitDto`, `WorldDeltaDto`, `NodeDto`.
- DTO adapters in `packages/server/src/rooms/dto.ts`.
- Update `GameRoom`:
  - Replace agar input with shooter input (WASD, aimX/Y, shoot/dash/exit).
  - Add input stale clearing and reconnect semantics.
  - Replace `FfaEngine` with `GameEngine`.
  - Emit per-tick aggregated ledger events.
  - Interest-managed `world:delta` with **server-side LOD caps** and optional `spillCluster` (bandwidth reduction).

**Exit criteria**
- Shooter rooms send only shooter DTOs.
- Protocol version bump prevents old clients from joining.
- Per-tick ledger ops are aggregated and idempotent.

---

## Phase 3 — Client input + rendering

**Deliverables**
- Input layer (`packages/client/src/world/input.ts`):
  - WASD movement, mouse aim, LMB shoot, RMB/Space dash, Q exit.
  - Tick-aligned input throttling (send every tick or coalesced).
- Adapter updates (`packages/client/src/world/adapters.ts`):
  - Parse shooter DTOs and produce a shooter `WorldViewModel`.
  - Handle LOD `spillCluster` as VFX-only.
- Renderer updates (`packages/client/src/world/renderer.ts`):
  - Draw players, bullets, pellets, spills, obstacles.
  - Render exit progress, dash/charge VFX, stun states.
- HUD updates (`packages/client/src/components/hud/`):
  - Mass, payout estimate, exit progress, cooldowns/charge.

**Exit criteria**
- Client feels responsive (cosmetic feedback) while server remains authoritative.
- All new nodes render correctly; no agar entities remain.

---

## Phase 4 — Economy + ledger coupling

**Deliverables**
- Update `packages/server/src/services/exitController.ts` for fixed-point conversions.
- Add per-tick event aggregation in `GameEngine`:
  - `recycleMassTotal`, `pelletSpawnMassTotal`, `pelletSpawnCount`.
- Update `GameRoom` ledger operations:
  - Transfer once per tick per kind; idempotency keys `roomId:tick:kind`.
- Enforce budget gating for pellet spawns (no minting).

**Exit criteria**
- Conservation assertions pass in dev (no silent sinks, no minting).
- Exit ticket flow uses idempotency key `${sessionId}:${exitAttemptId}`.

---

## Phase 5 — Testing + verification

**Deliverables**
- Unit tests (server):
  - Deterministic math, mass conversions, dash vs dash tie, exit progress rules.
- Simulation property tests:
  - Conservation invariants over N ticks.
  - No negative mass/budget.
- Integration tests:
  - Join -> play -> exit ticket flow.
  - Disconnect/reconnect behavior.
- Load tests:
  - 100 CCU with bullets/spills; validate delta sizes and tick time.

**Exit criteria**
- CI green with new tests.
- Tick time within budget at 100 CCU target.

---

## Phase 6 — Deployment readiness

**Deliverables**
- Feature flag / config toggle for shooter rooms.
- Updated observability (metrics):
  - tick time, delta sizes, ledger failures, budget exhausted events, LOD drops.
- Staging runbook:
  - protocolVersion gating
  - rollback path to agar rooms
  - smoke test checklist (join, input, shoot, dash, exit).

**Exit criteria**
- Staging passes functional + load smoke tests.
- Rollback path tested.

---

## Cutover checklist (production)

- Bump `protocolVersion` and deploy client first.
- Deploy server with shooter flag enabled for all rooms (single cutover).
- Monitor tick time, delta sizes, ledger health, exit success rate.
- Roll back by reverting to the previous server build (agar code still present but unused).

---

## Confirmed decisions

- Shooter-only rollout (no parallel agar rooms).
- LOD is server-side to reduce per-client bandwidth; client does not cull beyond what it receives.
- No contract/indexer changes.

