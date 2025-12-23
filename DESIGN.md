# Design (High-level, current)

This document describes the **current product + UI design** of `globs.fun` at a high level (what the user experiences, what screens/components exist, and the primary flows).

## Product positioning

- **One-liner**: “Earn real money playing agar.”
- **Core promise**: Deposit to spawn, play to grow, and (if you survive) exit to claim a payout.
- **Vibe**: **arcade-fun and clean** (bright, simple, game-first; avoid “casino grime” and avoid heavy fintech stiffness).

## App layout (information architecture)

The client is a single-page experience with three always-mounted layers:

- **World (canvas)**: the gameplay surface (`World`) that renders behind everything.
- **Navbar (top)**: persistent global status + wallet summary.
- **Overlay (center card)**: the lobby / pre-game controller UI, shown by default and hidden while in-game.

## Navbar (current)

**Purpose**: communicate “the game is live” + global pot size + the player’s wallet state at a glance.

- **Left**: `globs.fun` brand
- **Middle**:
  - `X players live` (aggregated across rooms)
  - `World bankroll $Y (Z ETH)` (aggregated across rooms; sourced from rooms list)
- **Right**:
  - If signed in: `{primaryHandle} · $walletUsd (walletEth)` and a short wallet address suffix
  - If signed out: `Sign in to play`

## Overlay (current)

**Purpose**: “mission control” for the entire join flow.

**Primary elements**:
- **Title**: `globs.fun`
- **Subtitle**: `Earn real money playing agar.`
- **Display name (optional)**:
  - Input stored in `localStorage` keyed by user id
  - Disabled unless authenticated
  - Used as `displayName` when joining
- **Server select**:
  - Each option displays: buy-in in **USD + ETH**, **player count**, and **pot** (world bankroll) for that server
- **Primary CTA**: `Play` (or stateful label; see below)
- **Helper text**:
  - Explains next requirement (sign-in, wallet, funding gap), or status (checking/depositing/joining), or error

**CTA labels (stateful)**:
- `Sign In to Play` (not authenticated)
- `Add Funds` (authenticated but wallet balance < buy-in)
- `Play` (ready)
- Busy states: `Checking...`, `Depositing...`, `Joining...`, `Funding...`

**Exit ticket panel (currently present, explicitly “testing”)**
- Displays an exit ticket JSON blob (if present) and supports claiming it on-chain via `exitWithSignature(...)`.

## Primary user flows (current)

### Landing → ready-to-play

- User lands on the page and sees:
  - the world canvas in the background
  - navbar stats (players live, world bankroll)
  - overlay card prompting sign-in + play

### Play flow (happy path)

1. **Sign in** (Privy) if needed
2. **Wallet ready**: active address must be present
3. **Funding check**: if balance < selected server buy-in, user is prompted to fund via Privy’s funding flow
4. **Join eligibility check** (server-side)
   - If reconnect is possible: join via `roomId` without depositing
   - Else if an unused deposit exists: join using that `depositId`
   - Else: proceed to deposit
5. **Deposit** (on-chain `World.deposit(serverId)` via the client) and extract a `depositId`
6. **Join** the selected server via websocket and enter the game
7. **Overlay hides** while in-game

### Exit → claim payout (current shape)

- Server issues an **exit ticket** after a successful hold-to-exit.
- Client can claim by calling `World.exitWithSignature(serverId, sessionId, payout, deadline, signature)`.
- Current UI exposes this via a “testing” panel in the overlay.
- **Desired v0 behavior**: on a **successful exit + claim**, return the user to **home/overlay** (the default lobby state).

## Visual / UI style (current)

- **Approach**: lightweight custom CSS classes (no full design system library in use)
- **Composition**: one centered overlay card, minimal form controls, a single high-signal CTA
- **Tone**: short, direct, money-forward copy (explicitly mentions earnings and risk)

## v0 scope (what exists today)

- World canvas + overlay-driven “Play” flow
- Server selection with buy-in and pot visibility
- Privy auth + wallet readiness gating
- Deposit + join flow (including rejoin eligibility)
- Basic exit claim surface (marked as testing)
- Leaderboard: **in-game** (not a separate overlay screen in v0)

## Decisions locked (from current direction)

1. **Brand + vibe**: **arcade-fun and clean**
2. **Risk disclosure**: **implied** (avoid heavy explicit warnings in the main flow)
3. **Leaderboard**: **in-game**
4. **Exit UX**: on success, return to **home/overlay**
5. **Terminology**: **pot** = total money in the world (aggregate value available in the world)

## Remaining open questions (optional)

1. **Copy**: keep the current subtitle (“Earn real money playing agar.”) or change it to something more arcade?
2. **Pot label**: should navbar say `Pot` (simple) or `Pot (in world)` / `World pot` (slightly clearer)?


