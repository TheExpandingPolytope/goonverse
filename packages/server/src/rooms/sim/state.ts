import type { RngState } from "./rng.js";

export type Vec2 = { x: number; y: number };

export type PlayerInput = {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  aimX: number;
  aimY: number;
  shoot: boolean;
  dash: boolean;
  exit: boolean;
};

export type PlayerInputEdges = {
  shootPressed: boolean;
  shootReleased: boolean;
  dashPressed: boolean;
  dashReleased: boolean;
  exitPressed: boolean;
  exitReleased: boolean;
};

export type PlayerState = {
  id: number;
  sessionId: string;
  wallet: `0x${string}`;
  displayName: string;
  depositId?: `0x${string}`;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  mass: number;
  spawnMass: number;
  radius: number;
  color: { r: number; g: number; b: number };
  alive: boolean;
  disconnectedAtTick?: number;
  // Input + edges
  input: PlayerInput;
  prevInput: PlayerInput;
  edges: PlayerInputEdges;
  // Combat state
  shootHoldTicks: number;
  shootChargeRatio: number;
  shootChargeVisualTicks: number;
  shootRecoveryTicks: number;
  fireCooldownTicks: number;
  dashHoldTicks: number;
  dashActiveTicks: number;
  dashCooldownTicks: number;
  invulnTicks: number;
  stunTicks: number;
  stunGraceTicks: number;
  slowTicks: number;
  magnetBoostTicks: number;
  exitCombatTagTicks: number;
  hitFlashTicks: number;
  baseTaxCarry: number;
  // Exit state
  exitHoldTicks: number;
  exitProgress: number;
  exitSafeHoldTicks: number;
  exitAttemptId: number;
};

export type BulletState = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damageMass: number;
  ownerSessionId: string;
  ttlTicks: number;
};

export type PickupKind = "pellet" | "spill";

export type PickupState = {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  radius: number;
  mass: number;
  attackerSessionId?: string;
  victimSessionId?: string;
  unlockTick?: number;
  spawnTick: number;
};

export type ObstacleState = {
  id: number;
  x: number;
  y: number;
  radius: number;
};

export type WorldState = {
  tick: number;
  rng: RngState;
  // Legacy rectangular bounds (for fallback/obstacle placement)
  bounds: { left: number; right: number; top: number; bottom: number };
  baselineSpawnMass: number;
  // Dynamic circular border (POC parity)
  borderRadius: number;
  borderTargetRadius: number;
  borderVelocity: number;
  playersInWorld: number;
};
