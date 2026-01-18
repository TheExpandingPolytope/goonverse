## Plan: Passive Economy (Implemented)

The game runs a sustainable passive pellet economy with these properties:
- **Pellets spawn at a steady, configurable rate** (not burst on revenue).
- **Passive burn (tax) is recycled** (returned as pellets).
- **A controlled "profit leak"** drains a small % of reserves over time (capped passive profit).
- **Actions** (shoot/dash) add to Reserve, extending runway but not speeding up emissions.

### Core Formula

```
spawnValueRate = B + λ * R

Where:
- B = base burn rate (cents/sec) - recycled back
- λ = -ln(1 - X) / T
- X = passiveProfitCapPct (e.g., 5%)
- T = passiveProfitTimeSec (e.g., 300s)
- R = current passiveReserve
```

### Config Knobs

| Knob | Default | Effect |
|------|---------|--------|
| `pelletValue` | 0.5% stake (10¢ at $20) | Spawn frequency |
| `passiveProfitCapPct` | 5% | Generosity (profit available) |
| `passiveProfitTimeSec` | 300s | Pacing (leak speed) |
| `initialReserve` | 1000¢ ($10) | Bootstrap runway |

### State Variables

- `worldReserve`: Total spendable pool (all inflows).
- `passiveReserve`: Passive-only funds (seed + tax).
- `baseBurnSinceLastSpawn`: Accumulator for tax between spawn checks.
- `spawnCarry`: Budget accumulator for pellet spawning.

### Behavior Summary

1. **Player spawns** → Tax starts (3¢/sec at $20 stake).
2. **Tax goes to Reserve** → Both `worldReserve` and `passiveReserve` increase.
3. **Spawn check** (every ~1s) → `spawnCarry` increases by `(baseBurn + λ*R)*dt`.
4. **When `spawnCarry >= pelletValue`** → Pellet spawns, Reserve decreases.
5. **Shooting/Dashing** → Adds to `worldReserve` only (extends runway).
6. **No players** → No spawns (gated).