import { Schema, ArraySchema, MapSchema } from "@colyseus/schema";
/**
 * Pellet - static food items on the map
 */
export declare class Pellet extends Schema {
    id: string;
    x: number;
    y: number;
    mass: number;
    radius: number;
    color: number;
}
/**
 * Ejected Mass - moving mass projectiles that can be eaten
 */
export declare class EjectedMass extends Schema {
    id: string;
    owner: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    mass: number;
    radius: number;
    createdAt: number;
}
/**
 * Player blob state - synchronized to all clients
 *
 * Each player can have multiple blobs after splitting.
 * Blobs have velocity for physics-based movement.
 */
export declare class Blob extends Schema {
    id: string;
    owner: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    targetX: number;
    targetY: number;
    mass: number;
    radius: number;
    timeSinceSplit: number;
    canMerge: boolean;
    isExiting: boolean;
    exitProgress: number;
    originalRadius: number;
    lastSplitTime: number;
    lastEjectTime: number;
}
/**
 * Player state - synchronized to all clients
 *
 * A player can control multiple blobs after splitting.
 */
export declare class Player extends Schema {
    sessionId: string;
    wallet: string;
    displayName: string;
    spawnMass: number;
    currentMass: number;
    isAlive: boolean;
    isExiting: boolean;
    exitStartedAt: number;
    blobs: ArraySchema<Blob>;
    color: number;
}
/**
 * Main game state - the root schema synchronized to all clients
 */
export declare class GameState extends Schema {
    serverId: string;
    tickRate: number;
    exitHoldMs: number;
    massPerEth: number;
    players: MapSchema<Player, string>;
    pellets: MapSchema<Pellet, string>;
    ejectedMass: MapSchema<EjectedMass, string>;
    worldWidth: number;
    worldHeight: number;
    worldBalance: string;
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
    x: number;
    y: number;
    q: boolean;
    space: boolean;
    w: boolean;
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
