# POC Parity Checklist

This document tracks parity between the `/poc` single-player demo and the production `/packages/client` + `/packages/server` implementation.

## Core Gameplay Mechanics

### Movement
- [x] WASD movement with acceleration
- [x] Friction and speed cap
- [x] Mobility scaling based on radius
- [x] Slow effect from damage

### Shooting
- [x] LMB hold-to-charge mechanic
- [x] Charge time (1200ms)
- [x] Bullet speed scales with charge
- [x] Bullet radius scales with charge
- [x] Recoil on shoot
- [x] Shot cost (% of balance)
- [x] Movement penalty while charging

### Dash
- [x] RMB/Space hold-to-charge mechanic
- [x] Dash force scales with charge
- [x] Dash cost (% of balance)
- [x] Overheat stun mechanic
- [x] Cooldown system
- [x] Movement penalty while charging

### Exit/Cashout
- [x] Q hold-to-exit mechanic
- [x] 3-second (60 tick) exit duration
- [x] Combat tag blocks exit progress
- [x] Damage rewinds exit progress
- [x] Exit beacon range for contestability

### Combat
- [x] Bullet damage reduces balance
- [x] Damage spills loot pickups
- [x] Stun on bullet hit
- [x] Slow effect on damage
- [x] Dash deflects bullets
- [x] Dash vs dash collision (momentum winner)

## Economy

### Balance System
- [x] Mass = balance (stake-based)
- [x] Radius scales with balance (sqrt curve)
- [x] Passive tax drain
- [x] Min balance floor (liquidation)
- [x] Shot/dash costs as % of balance

### Pickups
- [x] Pellet spawning (center-biased)
- [x] Spill drops from damage
- [x] Magnet pickup range
- [x] Attacker priority on spills

## World & Border

### Dynamic Border
- [x] Circular world border (not rectangular)
- [x] Border radius scales with player count
- [x] Border velocity smoothing (5 units/tick max)
- [x] Border bounce physics (retention 0.25)
- [x] Bullets culled beyond border

### Obstacles
- [x] Circular obstacles
- [x] Center-biased placement
- [x] Obstacle collision bounce

## Visuals

### Renderer
- [x] Dark background (#0f0f14)
- [x] 100px grid lines
- [x] Circular border (red)
- [x] Out-of-bounds red tint
- [x] Flat circle entities (not jelly)
- [x] Dark outline on entities
- [x] Barrel pointing at aim direction
- [x] Charge ring indicator
- [x] Exit progress ring
- [x] Stun pips (orbiting)
- [x] Speed-based trails

### Colors (POC Palette)
- [x] Primary (green): #4ade80
- [x] Danger (rose): #fb7185
- [x] Warning (gold): #fcd34d
- [x] Background: #0f0f14

## HUD

### Layout
- [x] Bottom center: Balance + PnL badge
- [x] Top right: Leaderboard (compact)
- [x] Bottom right: Transaction log
- [x] Top center: Event feed
- [x] Bottom left: Controls hint
- [x] Top left: Status indicators (stun, slow, combat)

### Styling
- [x] Flat dark panels
- [x] Green money text
- [x] Red/green for loss/gain

## Audio & FX

### Audio
- [x] WebAudio synth (no samples)
- [x] Shoot sound (sawtooth + square)
- [x] Dash sound (triangle)
- [x] Collect sound (sine)
- [x] Impact sound (square)
- [x] Stun sound (square slide)
- [x] Spatial distance falloff

### Visual Effects
- [x] Screen shake
- [x] Damage flash overlay
- [x] Gain flash overlay
- [x] Shockwaves
- [x] Particles

## Protocol

### Delta Format
- [x] Border state in WorldInitDto
- [x] Border state in WorldDeltaDto
- [x] Player state includes all combat fields
- [x] Exit progress field

## Server Sim

### Config Alignment
- [x] 20 TPS tick rate
- [x] POC movement constants
- [x] POC shooting constants
- [x] POC dash constants
- [x] POC exit constants
- [x] POC economy constants

### Border Logic
- [x] Dynamic radius calculation
- [x] Border velocity clamping
- [x] Border collision physics
- [x] Spawn position within border

## Tuning Notes

Run side-by-side tests comparing:
1. Movement feel (acceleration, max speed)
2. Shoot charge/fire responsiveness
3. Dash distance and timing
4. Exit timing under fire
5. Balance drain rate from tax
6. Pellet spawn density

Adjust `SIM_CONFIG` values as needed for parity.
