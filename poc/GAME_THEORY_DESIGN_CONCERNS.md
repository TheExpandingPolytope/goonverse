### Game Theory & Design Concerns (Problem List)

This document enumerates **potential game-theory / design failure modes** for Ballistic Capital, from first principles, with a focus on **what could become “the optimal way to play.”**

**Important:** This is intentionally **not proposing solutions**. It’s a map of risks, why they happen, and what “dominant gameplay” would look like.

Assumptions:
- Target scale is **~100 players per server** (PoC may run fewer).
- Objective is **profit over entry fee** (convert in-match balance into wallet via exit).
- The match economy aims to be **money-conserving** (balance/reserve/ground money are the supply).

---

### 1) Shoot Spam Meta (volume-of-fire dominates)
- **Description**: Low-cost shots are fired at high frequency to win via volume rather than aim/commitment.
- **Why it can become optimal**:
  - **Exit denial by volume**: even small rewind on exit can be strongest when multiplied by many hits.
  - **Lane zoning**: if bullets are fast/accurate enough, “spraying angles” forces movement errors.
  - **Statistical hits in large lobbies**: with many targets, random bullets hit *someone*.
  - **Harassment EV**: even if direct damage EV is slightly negative, it can be rational if it blocks a high-value cashout.
- **Failure mode**: gameplay collapses into “always shoot” with low decision quality; aim skill is secondary to APM/volume.

---

### 2) Charged-Shot Dominance (only big shots matter)
- **Description**: Optimal play becomes “charge and land one big shot” rather than sustained fighting.
- **Why it can become optimal**:
  - High reward per hit reduces the need to expose yourself repeatedly.
  - If charged bullets become too reliable (speed/size), counterplay shrinks.
- **Failure mode**: combat feels like burst sniping; small mistakes instantly swing outcomes; low interaction density.

---

### 3) Dash-First / Stun Loop Meta (dash replaces everything)
- **Description**: Dash impact becomes the primary win condition; shooting is mostly a finisher.
- **Why it can become optimal**:
  - Dash provides mobility + brief invuln + decisive CC.
  - If dash outcomes are near-deterministic at close range, it dominates EV.
- **Failure mode**: repetitive “dash check” interactions; non-dash play feels suboptimal.

---

### 4) Exit Denial / “Crab Bucket” as a Lobby-Wide Strategy
- **Description**: The lobby learns that stopping exits is the highest leverage action, regardless of kill chance.
- **Why it can become optimal**:
  - Denying conversion often has higher EV than farming pellets or taking even fights.
  - In large lobbies, someone is always close enough to try to interrupt.
- **Failure mode**: cashing out feels rare; rich players are perpetually trapped in combat until liquidation.

---

### 5) Scalping / Hit-and-Run Extraction (short sessions dominate)
- **Description**: Optimal play becomes “enter, grab small safe value, exit immediately; repeat.”
- **Why it can become optimal**:
  - Minimizes exposure to third parties and high-variance fights.
  - Reduces time spent paying burn/tax while holding value.
- **Failure mode**: shallow sessions; low emotional arc; few meaningful engagements.

---

### 6) Vulture / Third-Party Looting (initiators are punished)
- **Description**: Players avoid starting fights; they arrive late to scoop spills from weakened players.
- **Why it can become optimal**:
  - Starting fights exposes you and spends resources; arriving late captures value with less risk.
  - With many players, “someone else will fight” is always true.
- **Failure mode**: low initiation rate; passive stalking; winners are determined by timing rather than skill.

---

### 7) Kill Steal vs Damage Attribution (reward mismatch)
- **Description**: Rewards correlate with last-hit timing or proximity rather than contribution.
- **Why it can become optimal**:
  - Players optimize for steals (finishers) instead of fair fights (attrition).
  - Creates a “don’t commit, just snipe the last 10%” equilibrium.
- **Failure mode**: players feel robbed; effort doesn’t correlate with payout; toxic play patterns increase.

---

### 8) Public-Good Free-Rider Dynamic (reserve-funded pellets)
- **Description**: Players gain by letting others “fund the world” (via burn/action costs), then vacuuming pellets.
- **Why it can become optimal**:
  - Spending creates positive externalities if it increases pellet availability for everyone.
  - In big lobbies, the free-rider has consistent opportunity.
- **Failure mode**: passive farming dominates; aggression becomes altruistic.

---

### 9) Rich Target “Pinata” Dynamics (bounty dogpiles)
- **Description**: Wealth makes you a public target; the lobby coordinates implicitly against the richest.
- **Why it can become optimal**:
  - The richest player is the largest payout and usually easiest to notice.
  - Even negative-EV harassment can be justified by the payout size.
- **Failure mode**: rich players can’t stabilize; progression feels like a trap; endgame is mostly evasion.

---

### 10) Terrain / Obstacle Camping (positional exploitation)
- **Description**: Optimal fights happen only at obstacles/borders to exploit bounce/line-of-sight/predictability.
- **Why it can become optimal**:
  - Terrain can create deterministic advantages (safe angles, forced paths).
  - Players can reduce variance by choosing “solved” zones.
- **Important note**: This is **largely mitigated by burn/tax pressure** (time spent camping has a direct cost), so “hard camping forever” is less stable than in typical arena games.
- **Failure mode (if it still emerges)**: map devolves into a few hotspots; roaming feels suboptimal.

---

### 11) Soft Collusion / Teaming (in FFA)
- **Description**: Players implicitly cooperate (don’t shoot each other, focus a third) without explicit comms.
- **Why it can become optimal**:
  - Cooperation beats solo play in most payoff structures.
  - Temporary alliances form naturally against high-value targets.
- **Failure mode**: fairness perception collapses; solo players churn.

---

### 12) Alt-Feeding / Bankroll Transfer (multi-account abuse)
- **Description**: An account intentionally donates value to another account to guarantee profit.
- **Why it can become optimal**:
  - Removes uncertainty; converts skill game into deterministic transfer.
- **Failure mode**: economy integrity breaks; honest players can’t compete.

---

### 13) Spawn & Re-entry Punishment (churn risk)
- **Description**: New entrants get deleted quickly after paying entry.
- **Why it can become optimal**:
  - Spawns are predictable or visible; entry money becomes “free EV” for campers.
- **Failure mode**: players stop entering; the game feels predatory rather than competitive.

---

### 14) Variance Extremes (too swingy or too grindy)
- **Description**: The game can become either “one mistake ends you” or “vacuum and grind forever.”
- **Why it can become optimal**:
  - If burst combos dominate, winners are decided by a single interaction.
  - If pellets dominate, PvP becomes optional and inefficient.
- **Failure mode**: either frustration (swingy) or boredom (grindy).

---

### 15) Information / Targeting Externalities
- **Description**: If wealth/exit intent is obvious, targeting becomes trivial and constant.
- **Why it can become optimal**:
  - Players always chase the highest-value target they can identify.
- **Failure mode**: little strategy beyond “hunt the biggest number on screen.”

---

### 16) Tick/Netcode Sensitivity (design-level fairness)
- **Description**: At 100 players, latency and prediction will influence perceived fairness.
- **Why it can become optimal**:
  - Players gravitate toward strategies that exploit peeker’s advantage or desync-friendly actions.
- **Failure mode**: “I got robbed” moments; trust erosion; players quit even if the math is fair.

---

### 17) Audio/FX Spam as a Competitive Advantage
- **Description**: High-frequency actions create sensory overload (sound/vibration/flash), reducing clarity.
- **Why it can become optimal**:
  - If spam reduces opponent performance, it becomes rational even if EV-neutral.
- **Failure mode**: gameplay becomes noisy; skill expression drops; accessibility suffers.

---

### 18) Time Horizon Mismatch (optimal match length collapses)
- **Description**: If the best strategy is always “short sessions” or always “long survive,” variety dies.
- **Why it can become optimal**:
  - Players optimize time-to-wallet rather than moment-to-moment fun.
- **Failure mode**: one dominant pacing pattern; weak midgame.

