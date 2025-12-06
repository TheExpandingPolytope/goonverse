import { Schema, MapSchema, type } from "@colyseus/schema";

/**
 * Player blob state - synchronized to all clients
 * 
 * For now this is a placeholder with minimal physics.
 * Full physics (movement, collision, eating, splitting) will be added later.
 */
export class Blob extends Schema {
  @type("string") id: string = "";
  @type("string") owner: string = ""; // Player's sessionId
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") mass: number = 0;
  @type("number") radius: number = 0;
  @type("boolean") isExiting: boolean = false;
  @type("number") exitProgress: number = 0; // 0-1, progress through exit hold
}

/**
 * Player state - synchronized to all clients
 */
export class Player extends Schema {
  @type("string") sessionId: string = "";
  @type("string") wallet: string = "";
  @type("number") spawnMass: number = 0;
  @type("number") currentMass: number = 0;
  @type("boolean") isAlive: boolean = true;
  @type("boolean") isExiting: boolean = false;
  @type("number") exitStartedAt: number = 0;
  @type(Blob) blob: Blob = new Blob();
}

/**
 * Main game state - the root schema synchronized to all clients
 */
export class GameState extends Schema {
  @type("string") serverId: string = "";
  @type("number") tickRate: number = 20;
  @type("number") exitHoldMs: number = 3000;
  @type("number") massPerDollar: number = 100;
  @type({ map: Player }) players = new MapSchema<Player>();

  // World bounds (placeholder)
  @type("number") worldWidth: number = 4000;
  @type("number") worldHeight: number = 4000;
}

/**
 * Input message from client
 */
export interface InputMessage {
  x: number; // Target X position or direction
  y: number; // Target Y position or direction
  spacebar: boolean; // Exit trigger
}

/**
 * Spawn options passed when joining
 */
export interface SpawnOptions {
  serverId: `0x${string}`;
  depositId: `0x${string}`;
  wallet: `0x${string}`;
}

