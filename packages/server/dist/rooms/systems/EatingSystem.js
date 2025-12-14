import { GAME_CONFIG, massToRadius } from "../../gameConfig.js";
import { canEat, canEatPellet } from "./CollisionDetection.js";
import { distance } from "../utils/PhysicsUtils.js";
/**
 * Process all eating interactions
 * Returns array of killed player sessionIds
 */
export function processEating(state, blobGrid, pelletGrid, ejectedMassGrid) {
    const killedPlayers = [];
    const eatenPellets = [];
    const eatenEjectedMass = [];
    const eatenBlobs = new Set();
    // Process each player's blobs
    state.players.forEach((player) => {
        if (!player.isAlive)
            return;
        for (const blob of player.blobs) {
            if (eatenBlobs.has(blob.id))
                continue;
            // Check eating other players' blobs
            // Create a temporary BlobEntity for querying
            const blobEntity = {
                id: blob.id,
                x: blob.x,
                y: blob.y,
                radius: blob.radius,
                blob,
                player,
            };
            const nearbyBlobs = blobGrid.queryPotentialCollisions(blobEntity);
            for (const otherEntity of nearbyBlobs) {
                if (eatenBlobs.has(otherEntity.id))
                    continue;
                if (otherEntity.blob.owner === blob.owner)
                    continue; // Same player
                const otherBlob = otherEntity.blob;
                const otherPlayer = otherEntity.player;
                if (canEat(blob, otherBlob)) {
                    // Eat the other blob
                    eatBlob(blob, otherBlob);
                    eatenBlobs.add(otherBlob.id);
                    // Check if other player is now dead
                    const remainingBlobs = otherPlayer.blobs.filter(b => !eatenBlobs.has(b.id));
                    if (remainingBlobs.length === 0) {
                        killedPlayers.push(otherPlayer.sessionId);
                        otherPlayer.isAlive = false;
                    }
                }
                else if (canEat(otherBlob, blob)) {
                    // Other blob eats this blob
                    eatBlob(otherBlob, blob);
                    eatenBlobs.add(blob.id);
                    // Check if this player is now dead
                    const remainingBlobs = player.blobs.filter(b => !eatenBlobs.has(b.id));
                    if (remainingBlobs.length === 0) {
                        killedPlayers.push(player.sessionId);
                        player.isAlive = false;
                    }
                    break; // This blob is eaten, move to next
                }
            }
            // Skip pellet/ejected mass checks if this blob was eaten
            if (eatenBlobs.has(blob.id))
                continue;
            // Check eating pellets
            const nearbyPellets = pelletGrid.queryRadius(blob.x, blob.y, blob.radius + GAME_CONFIG.PELLET_RADIUS);
            for (const pellet of nearbyPellets) {
                if (eatenPellets.includes(pellet.id))
                    continue;
                if (canEatPellet(blob, pellet.x, pellet.y, pellet.radius)) {
                    eatPellet(blob, pellet);
                    eatenPellets.push(pellet.id);
                }
            }
            // Check eating ejected mass
            const nearbyEjected = ejectedMassGrid.queryRadius(blob.x, blob.y, blob.radius + GAME_CONFIG.EJECT_MASS);
            for (const ejected of nearbyEjected) {
                if (eatenEjectedMass.includes(ejected.id))
                    continue;
                // Can't eat your own ejected mass for a brief period (prevent instant re-eat)
                const timeSinceEject = Date.now() - ejected.createdAt;
                if (ejected.owner === blob.owner && timeSinceEject < 500)
                    continue;
                const dist = distance(blob.x, blob.y, ejected.x, ejected.y);
                if (dist < blob.radius + ejected.radius) {
                    eatEjectedMass(blob, ejected);
                    eatenEjectedMass.push(ejected.id);
                }
            }
        }
    });
    // Remove eaten blobs from players
    state.players.forEach((player) => {
        const blobsToRemove = [];
        player.blobs.forEach((blob, index) => {
            if (eatenBlobs.has(blob.id)) {
                blobsToRemove.push(index);
            }
        });
        // Remove in reverse order to maintain indices
        for (let i = blobsToRemove.length - 1; i >= 0; i--) {
            const idx = blobsToRemove[i];
            if (idx !== undefined) {
                player.blobs.splice(idx, 1);
            }
        }
        // Update player's total mass
        updatePlayerMass(player);
    });
    // Remove eaten pellets
    for (const pelletId of eatenPellets) {
        // IMPORTANT: remove from spatial grid before deleting from state map.
        // Deleting first makes state.pellets.get(pelletId) return undefined and can crash in SpatialGrid.remove().
        const pellet = state.pellets.get(pelletId);
        if (pellet) {
            pelletGrid.remove(pellet);
            state.pellets.delete(pelletId);
        }
        else {
            // State already missing this pellet; ensure map doesn't retain the key.
            state.pellets.delete(pelletId);
        }
    }
    // Remove eaten ejected mass
    for (const ejectedId of eatenEjectedMass) {
        const ejected = state.ejectedMass.get(ejectedId);
        if (ejected) {
            ejectedMassGrid.remove(ejected);
            state.ejectedMass.delete(ejectedId);
        }
    }
    return killedPlayers;
}
/**
 * One blob eats another blob
 */
function eatBlob(eater, prey) {
    // Transfer 100% of prey's mass
    eater.mass += prey.mass;
    eater.radius = massToRadius(eater.mass);
}
/**
 * Blob eats a pellet
 */
function eatPellet(blob, pellet) {
    blob.mass += pellet.mass;
    blob.radius = massToRadius(blob.mass);
}
/**
 * Blob eats ejected mass
 */
function eatEjectedMass(blob, ejected) {
    blob.mass += ejected.mass;
    blob.radius = massToRadius(blob.mass);
}
/**
 * Update player's total mass from all their blobs
 */
export function updatePlayerMass(player) {
    let totalMass = 0;
    for (const blob of player.blobs) {
        totalMass += blob.mass;
    }
    player.currentMass = totalMass;
}
