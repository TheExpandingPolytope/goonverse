# POC Parity Plan (Client + Server)

This plan aligns the in-game feel and visuals of `/packages/client` and
`/packages/server` with the current POC in `/poc`. It focuses on gameplay
and on-screen presentation only (not the lobby/overlay screens).

## Decisions Locked In
- Server authoritative.
- PvP only (no bots).
- Keep ledger-based economy and exit tickets.
- Match POC visual style.
- Add POC-style audio, screen shake, and particles.
- Match POC HUD layout.

## Goals
- Gameplay mechanics match POC from the player perspective.
- Visuals and VFX match POC style and readability.
- Keep ledger economy and existing room/exit flow intact.
- Avoid breaking protocol compatibility for active clients.

## Non-goals
- Lobby/overlay parity.
- New on-chain or indexer changes.
- Client-side prediction beyond cosmetic effects.

## References
- POC loop: `/poc/src/main.js`, `/poc/src/simulation.js`, `/poc/src/renderer.js`
- POC config: `/poc/src/config.js`, `/poc/src/tickConfig.js`
- Server sim: `/packages/server/src/rooms/sim/engine.ts`, `config.ts`
- Client render: `/packages/client/src/world/renderer.ts`

---

## Phase 0 - Parity Spec and Mapping (1-2 days)
Deliverables
- A mapping table that converts POC constants (cents, ticks) into server mass units.
- A parity checklist for mechanics, camera feel, and visuals.

Tasks
- Create a POC-to-SIM_CONFIG mapping doc (dash, shoot, exit, movement, pellets).
- Define stake mapping: POC stake == server spawnMass for all % based knobs.
- Lock camera rules (speed-based zoom + aim look-ahead) and grid style.

Exit criteria
- All values and behaviors are agreed and documented.

---

## Phase 1 - Server Simulation Parity (Authoritative)
Deliverables
- Server simulation mirrors POC timing and behaviors.

Tasks
- Update `SIM_CONFIG` to POC parity:
  - dash charge/overheat/cooldown/active durations
  - shoot charge/cooldown/recoil and bullet ttl/radius
  - exit duration, combat tag, and hit rewind logic
  - pellet/spill size and magnet rules
- Implement dynamic circular border (authoritative):
  - dynamic target radius based on players in world
  - border physics bounce and bullet culling
  - clamp spawns and pickups to active border
- Align pellet emission to POC:
  - reserve-gated spawns with center bias and spacing rules
  - keep ledger budget gating at room level

Exit criteria
- Server tick behavior matches POC in single-player equivalence tests.

---

## Phase 2 - Protocol Extensions
Deliverables
- Delta payload includes all data required for POC visuals.

Tasks
- Add border data to `WorldInitDto` and `WorldDeltaDto` or a dedicated node type.
- Add obstacle shape/color info (or deterministic client derivation).
- Add hit/flash info needed for screen flash and direction indicators.

Exit criteria
- Client can render all POC visuals from server data only.

---

## Phase 3 - Client Renderer Parity (World)
Deliverables
- POC-style rendering for world entities and effects.

Tasks
- Replace jelly/blob rendering with flat circles + barrel + bold outlines.
- Render circular border, out-of-bounds red overlay, aim line.
- Apply POC palette and grid spacing.
- Add local-only VFX system:
  - dash trails, particles, shockwaves
  - hit shake and damage flash
  - floating combat text
- Replace bullet drawing with POC bullet style.

Exit criteria
- Visuals match POC when driven by live server state.

---

## Phase 4 - Client HUD Parity
Deliverables
- HUD layout and feedback match POC.

Tasks
- Implement POC HUD layout (bottom-center balance/PnL, top-right leaderboard).
- Add transaction log and event feed.
- Add status message and dash cooldown bar.
- Add control hint overlay.

Exit criteria
- On-screen UI matches POC layout and information density.

---

## Phase 5 - Audio Parity
Deliverables
- POC-style WebAudio cues with spatial falloff.

Tasks
- Port POC audio synth to client.
- Trigger audio on dash/shoot/collect/stun/impact events from state deltas.

Exit criteria
- Audio cues match POC timing and intensity.

---

## Phase 6 - Tuning and Validation
Deliverables
- Parity sign-off and regression checklist.

Tasks
- Side-by-side POC vs prod feel tests.
- Adjust constants until dash, shot cadence, and exit feel match.
- Validate delta sizes and perf at target CCU.

Exit criteria
- POC parity checklist green and perf within budget.
