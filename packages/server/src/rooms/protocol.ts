export const PROTOCOL_VERSION = 4;

export type WorldInitDto = {
  protocolVersion: number;
  serverId: string;
  tickMs: number;
  // Legacy rectangular bounds (kept for compatibility)
  world: { left: number; right: number; top: number; bottom: number };
  // Dynamic circular border (POC parity)
  border: {
    radius: number;
    targetRadius: number;
    maxRadius: number;
    minRadius: number;
  };
  massPerEth: number;
  exitHoldMs: number;
  massScale: number;
};

export type WorldDeltaDto = {
  tick: number;
  nodes: NodeDto[];
  removedIds: number[];
  ownedIds: number[];
  // Dynamic border state (POC parity)
  border?: {
    radius: number;
    targetRadius: number;
    velocity: number;
  };
};

export type InputMessage = {
  // Movement intent
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;

  // Aim target in world space
  aimX: number;
  aimY: number;

  // Holds
  shoot: boolean;
  dash: boolean;
  exit: boolean;

  // Optional reconciliation
  clientTick?: number;
};

export type NodeDto =
  | {
      kind: "player";
      id: number;
      ownerSessionId: string;
      displayName: string;
      x: number;
      y: number;
      radius: number;
      mass: number;
      spawnMass?: number;
      color: { r: number; g: number; b: number };
      flags: number;
      exitProgress?: number;
      vx?: number;
      vy?: number;
      aimX?: number;
      aimY?: number;
      dashChargeRatio?: number;
      shootChargeRatio?: number;
      dashCooldownTicks?: number;
      dashActiveTicks?: number;
      stunTicks?: number;
      slowTicks?: number;
      shootRecoveryTicks?: number;
      exitCombatTagTicks?: number;
      hitFlashTicks?: number;
    }
  | { kind: "bullet"; id: number; x: number; y: number; radius: number; flags: number }
  | { kind: "pellet"; id: number; x: number; y: number; radius: number; mass: number; flags: number }
  | {
      kind: "spill";
      id: number;
      x: number;
      y: number;
      radius: number;
      mass: number;
      attackerSessionId?: string;
      victimSessionId?: string;
      unlockTick?: number;
      flags: number;
    }
  | { kind: "spillCluster"; id: number; x: number; y: number; radius: number; mass: number; count: number; flags: number }
  | { kind: "obstacle"; id: number; x: number; y: number; radius: number; flags: number };
