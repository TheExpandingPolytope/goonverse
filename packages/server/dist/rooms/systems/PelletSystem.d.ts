import { GameState, Pellet } from "../schema/GameState.js";
import { BalanceSystem } from "./BalanceSystem.js";
/**
 * Spawn pellets up to the max limit
 * Called each tick, spawns based on PELLET_SPAWN_RATE
 */
export declare function spawnPellets(state: GameState, deltaTime: number, balanceSystem: BalanceSystem): Pellet[];
/**
 * Initialize pellets at game start
 * Spawns a percentage of max pellets immediately
 */
export declare function initializePellets(state: GameState, percentage?: number): void;
/**
 * Remove a pellet from the game
 */
export declare function removePellet(state: GameState, pelletId: string): void;
