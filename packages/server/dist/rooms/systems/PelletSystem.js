import { randomUUID } from "crypto";
import { Pellet } from "../schema/GameState.js";
import { GAME_CONFIG } from "../../gameConfig.js";
/**
 * Pellet System
 *
 * Handles spawning and managing pellets (static food) on the map.
 * Pellets are spawned up to MAX_PELLETS at PELLET_SPAWN_RATE per second.
 */
/**
 * Generate a unique pellet ID
 */
function generatePelletId() {
    return `pellet_${randomUUID()}`;
}
/**
 * Spawn pellets up to the max limit
 * Called each tick, spawns based on PELLET_SPAWN_RATE
 */
export function spawnPellets(state, deltaTime, balanceSystem) {
    const currentCount = state.pellets.size;
    // Don't spawn if at max
    if (currentCount >= GAME_CONFIG.MAX_PELLETS) {
        return [];
    }
    // Calculate how many to spawn this tick
    const pelletsPerTick = GAME_CONFIG.PELLET_SPAWN_RATE * deltaTime;
    const toSpawn = Math.min(Math.ceil(pelletsPerTick), GAME_CONFIG.MAX_PELLETS - currentCount);
    const spawned = [];
    for (let i = 0; i < toSpawn; i++) {
        const pellet = createPellet();
        const success = balanceSystem.spendForPellet(state, pellet.mass);
        if (!success) {
            // Stop spawning if we ran out of funds
            break;
        }
        state.pellets.set(pellet.id, pellet);
        spawned.push(pellet);
    }
    return spawned;
}
/**
 * Create a new pellet at a random position
 */
function createPellet() {
    const pellet = new Pellet();
    pellet.id = generatePelletId();
    pellet.x = Math.random() * GAME_CONFIG.WORLD_WIDTH;
    pellet.y = Math.random() * GAME_CONFIG.WORLD_HEIGHT;
    pellet.mass = GAME_CONFIG.PELLET_MASS;
    pellet.radius = GAME_CONFIG.PELLET_RADIUS;
    pellet.color = Math.floor(Math.random() * 16); // 16 color variations
    return pellet;
}
/**
 * Initialize pellets at game start
 * Spawns a percentage of max pellets immediately
 */
export function initializePellets(state, percentage = 0.5) {
    const initialCount = Math.floor(GAME_CONFIG.MAX_PELLETS * percentage);
    for (let i = 0; i < initialCount; i++) {
        const pellet = createPellet();
        state.pellets.set(pellet.id, pellet);
    }
}
/**
 * Remove a pellet from the game
 */
export function removePellet(state, pelletId) {
    state.pellets.delete(pelletId);
}
