export type EngineEvent =
  | { type: "recycleMass"; mass: number }
  | { type: "pelletSpawned"; id: number; mass: number }
  | { type: "playerExited"; sessionId: string }
  | { type: "playerDied"; sessionId: string };

export type EngineTickResult = {
  events: EngineEvent[];
};
