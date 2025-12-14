export type NodeKind = "player" | "food" | "ejected" | "virus";

export type RgbColor = { r: number; g: number; b: number };

export type MoveEngine = {
  angleRad: number;
  speed: number;
  ticksRemaining: number;
  decay: number;
};

export type BaseNode = {
  id: number;
  kind: NodeKind;
  x: number;
  y: number;
};

export type PlayerNode = BaseNode & {
  kind: "player";
  ownerSessionId: string;
  mass: number;
  color: RgbColor;
  recombineSeconds: number; // decremented once per second
  ignoreCollisionTicks: number; // decremented per tick (smooth split)
  move?: MoveEngine; // split bursts / virus pop / overflow split
};

export type FoodNode = BaseNode & {
  kind: "food";
  mass: number;
  color: RgbColor;
};

export type EjectedNode = BaseNode & {
  kind: "ejected";
  mass: number;
  color: RgbColor;
  move?: MoveEngine; // present while moving; absent when stationary
  lastAngleRad: number; // for virus feeding direction
};

export type VirusNode = BaseNode & {
  kind: "virus";
  // Viruses are economically massless in our game, but still have a size for geometry.
  // We treat sizeMass as the value used for radius and eat thresholds.
  sizeMass: number;
  feedCount: number;
  lastFeedAngleRad: number;
};

export type WorldNode = PlayerNode | FoodNode | EjectedNode | VirusNode;

export type PlayerInputState = {
  mouseX: number;
  mouseY: number;
  splitPressed: boolean;
  ejectPressed: boolean;
};

export type PlayerSim = {
  sessionId: string;
  wallet: `0x${string}`;
  displayName: string;
  color: RgbColor;
  cellIds: number[];
  input: PlayerInputState;
  alive: boolean;
  depositId?: `0x${string}`;
  disconnectedAtMs?: number;
};

export type WorldBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};


