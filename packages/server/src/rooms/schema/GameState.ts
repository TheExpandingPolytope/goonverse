import { Schema, ArraySchema, MapSchema, type } from "@colyseus/schema";

/**
 * Pellet - static food items on the map
 */
export class Pellet extends Schema {
  @type("string") id: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") mass: number = 1;
  @type("number") radius: number = 10;
  @type("uint8") color: number = 0; // Color index for variety
}

/**
 * Ejected Mass - moving mass projectiles that can be eaten
 */
export class EjectedMass extends Schema {
  @type("string") id: string = "";
  @type("string") owner: string = ""; // Original owner's sessionId (can't eat own eject briefly)
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") vx: number = 0;
  @type("number") vy: number = 0;
  @type("number") mass: number = 16;
  @type("number") radius: number = 0;
  @type("number") createdAt: number = 0; // Timestamp for ownership timeout
}

/**
 * Player blob state - synchronized to all clients
 * 
 * Each player can have multiple blobs after splitting.
 * Blobs have velocity for physics-based movement.
 */
export class Blob extends Schema {
  @type("string") id: string = "";
  @type("string") owner: string = ""; // Player's sessionId
  
  // Position
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  
  // Velocity (for physics)
  @type("number") vx: number = 0;
  @type("number") vy: number = 0;
  
  // Target position (where player is aiming)
  @type("number") targetX: number = 0;
  @type("number") targetY: number = 0;
  
  // Size
  @type("number") mass: number = 0;
  @type("number") radius: number = 0;
  
  // Split/Merge tracking
  @type("number") timeSinceSplit: number = 0; // ms since last split
  @type("boolean") canMerge: boolean = false; // true when recombine timer expired
  
  // Exit state
  @type("boolean") isExiting: boolean = false;
  @type("number") exitProgress: number = 0; // 0-1, progress through exit hold
  @type("number") originalRadius: number = 0; // Radius before exit shrink started
  
  // Cooldowns (not synced to client, server-side only tracking)
  lastSplitTime: number = 0;
  lastEjectTime: number = 0;
}

/**
 * Player state - synchronized to all clients
 * 
 * A player can control multiple blobs after splitting.
 */
export class Player extends Schema {
  @type("string") sessionId: string = "";
  @type("string") wallet: string = "";
  @type("string") displayName: string = "";
  @type("number") spawnMass: number = 0;
  @type("number") currentMass: number = 0; // Sum of all blob masses
  @type("boolean") isAlive: boolean = true;
  @type("boolean") isExiting: boolean = false;
  @type("number") exitStartedAt: number = 0;
  
  // Multiple blobs (after splitting)
  @type([Blob]) blobs = new ArraySchema<Blob>();
  
  // Color for all player's blobs
  @type("uint8") color: number = 0;
}

/**
 * Main game state - the root schema synchronized to all clients
 */
export class GameState extends Schema {
  @type("string") serverId: string = "";
  @type("number") tickRate: number = 20;
  @type("number") exitHoldMs: number = 3000;
  @type("number") massPerEth: number = 100;
  
  // Players
  @type({ map: Player }) players = new MapSchema<Player>();
  
  // Pellets (static food)
  @type({ map: Pellet }) pellets = new MapSchema<Pellet>();
  
  // Ejected mass (moving food)
  @type({ map: EjectedMass }) ejectedMass = new MapSchema<EjectedMass>();

  // World bounds
  @type("number") worldWidth: number = 4000;
  @type("number") worldHeight: number = 4000;

  // World Balance (token balance for spawning pellets)
  @type("string") worldBalance: string = "0"; // Stored as string to handle BigInt safety
}

/**
 * Input message from client
 * 
 * Controls:
 * - x, y: Target position (cursor/touch)
 * - q: Hold to exit (cash out)
 * - space: Split
 * - w: Eject mass
 */
export interface InputMessage {
  x: number;       // Target X position
  y: number;       // Target Y position
  q: boolean;      // Exit trigger (hold to cash out)
  space: boolean;  // Split trigger
  w: boolean;      // Eject mass trigger
}

/**
 * Spawn options passed when joining
 */
export interface SpawnOptions {
  serverId: `0x${string}`;
  depositId: `0x${string}`;
  wallet: `0x${string}`;
  displayName?: string;
}
