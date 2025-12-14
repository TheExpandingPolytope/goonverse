import { randomUUID } from "crypto";
import { EjectedMass } from "../schema/GameState.js";
import { GAME_CONFIG, massToRadius } from "../../gameConfig.js";
import { normalize, vectorLength } from "../utils/PhysicsUtils.js";
/**
 * Eject System
 *
 * Handles ejecting mass from blobs. Ejected mass becomes a projectile
 * that others can eat. Players can use this to feed teammates, bait enemies,
 * or shed mass to speed up.
 */
/**
 * Generate a unique ejected mass ID
 */
function generateEjectedId() {
    return `ejected_${randomUUID()}`;
}
/**
 * Try to eject mass from a blob
 * Returns the created EjectedMass if successful, null otherwise
 */
export function tryEject(state, blob, targetX, targetY) {
    const now = Date.now();
    // Check cooldown
    if (now - blob.lastEjectTime < GAME_CONFIG.EJECT_COOLDOWN_MS) {
        return null;
    }
    // Check minimum mass
    if (blob.mass < GAME_CONFIG.MIN_EJECT_MASS) {
        return null;
    }
    // Calculate eject direction (toward cursor)
    const dx = targetX - blob.x;
    const dy = targetY - blob.y;
    let dir = normalize(dx, dy);
    // If cursor is on blob, eject in a default direction
    if (vectorLength(dx, dy) < 1) {
        dir = { x: 1, y: 0 };
    }
    // Reduce blob mass
    blob.mass -= GAME_CONFIG.EJECT_MASS;
    blob.radius = massToRadius(blob.mass);
    blob.lastEjectTime = now;
    // Create ejected mass
    const ejected = new EjectedMass();
    ejected.id = generateEjectedId();
    ejected.owner = blob.owner;
    ejected.mass = GAME_CONFIG.EJECT_MASS;
    ejected.radius = massToRadius(GAME_CONFIG.EJECT_MASS);
    ejected.createdAt = now;
    // Spawn at edge of blob
    ejected.x = blob.x + dir.x * (blob.radius + ejected.radius);
    ejected.y = blob.y + dir.y * (blob.radius + ejected.radius);
    // Apply velocity
    ejected.vx = dir.x * GAME_CONFIG.EJECT_SPEED;
    ejected.vy = dir.y * GAME_CONFIG.EJECT_SPEED;
    // Add to state
    state.ejectedMass.set(ejected.id, ejected);
    return ejected;
}
/**
 * Try to eject from all blobs of a player
 * Returns array of created ejected masses
 */
export function tryEjectAll(state, blobs, targetX, targetY) {
    const ejected = [];
    for (const blob of blobs) {
        const result = tryEject(state, blob, targetX, targetY);
        if (result) {
            ejected.push(result);
        }
    }
    return ejected;
}
