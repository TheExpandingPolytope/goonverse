import { GAME_CONFIG, getMaxSpeed, massToRadius } from "../../gameConfig.js";
import { normalize, vectorLength, distance } from "../utils/PhysicsUtils.js";
/**
 * Physics System
 *
 * Handles movement, acceleration, friction, and world bounds for all entities.
 * Includes forces like soft collision (push) and attraction (pull).
 * Server is fully authoritative - client only sends input targets.
 */
/**
 * Update blob movement toward target position
 * Applies acceleration, friction, and mass-based speed cap
 */
export function updateBlobMovement(blob, deltaTime) {
    // Skip if blob is exiting (handled separately with penalties)
    if (blob.isExiting) {
        updateExitingBlobMovement(blob, deltaTime);
        return;
    }
    // Calculate direction to target
    const dx = blob.targetX - blob.x;
    const dy = blob.targetY - blob.y;
    const distToTarget = vectorLength(dx, dy);
    // Only accelerate if we're not at the target
    if (distToTarget > 1) {
        const dir = normalize(dx, dy);
        // Apply acceleration toward target
        blob.vx += dir.x * GAME_CONFIG.ACCELERATION * deltaTime;
        blob.vy += dir.y * GAME_CONFIG.ACCELERATION * deltaTime;
    }
    // Apply friction
    blob.vx *= GAME_CONFIG.FRICTION;
    blob.vy *= GAME_CONFIG.FRICTION;
    // Clamp to max speed based on mass
    const maxSpeed = getMaxSpeed(blob.mass);
    const currentSpeed = vectorLength(blob.vx, blob.vy);
    if (currentSpeed > maxSpeed) {
        const scale = maxSpeed / currentSpeed;
        blob.vx *= scale;
        blob.vy *= scale;
    }
    // Update position
    blob.x += blob.vx * deltaTime;
    blob.y += blob.vy * deltaTime;
    // Clamp to world bounds
    clampToWorld(blob);
    // Update radius based on mass
    blob.radius = massToRadius(blob.mass);
}
/**
 * Update movement for a blob that is exiting (holding to cash out)
 * Applies speed penalty and radius shrink
 */
function updateExitingBlobMovement(blob, deltaTime) {
    // Calculate direction to target
    const dx = blob.targetX - blob.x;
    const dy = blob.targetY - blob.y;
    const distToTarget = vectorLength(dx, dy);
    if (distToTarget > 1) {
        const dir = normalize(dx, dy);
        // Apply reduced acceleration (exit speed penalty)
        const penalizedAccel = GAME_CONFIG.ACCELERATION * GAME_CONFIG.EXIT_SPEED_PENALTY;
        blob.vx += dir.x * penalizedAccel * deltaTime;
        blob.vy += dir.y * penalizedAccel * deltaTime;
    }
    // Apply friction
    blob.vx *= GAME_CONFIG.FRICTION;
    blob.vy *= GAME_CONFIG.FRICTION;
    // Clamp to reduced max speed
    const maxSpeed = getMaxSpeed(blob.mass) * GAME_CONFIG.EXIT_SPEED_PENALTY;
    const currentSpeed = vectorLength(blob.vx, blob.vy);
    if (currentSpeed > maxSpeed) {
        const scale = maxSpeed / currentSpeed;
        blob.vx *= scale;
        blob.vy *= scale;
    }
    // Update position
    blob.x += blob.vx * deltaTime;
    blob.y += blob.vy * deltaTime;
    // Clamp to world bounds
    clampToWorld(blob);
    // Radius shrinks based on exit progress (but mass stays the same for payout)
    // Shrink formula: currentRadius = originalRadius * (1 - shrinkProgress)
    // where shrinkProgress = exitProgress * (1 - EXIT_MIN_RADIUS_FACTOR)
    const shrinkProgress = blob.exitProgress * (1 - GAME_CONFIG.EXIT_MIN_RADIUS_FACTOR);
    blob.radius = blob.originalRadius * (1 - shrinkProgress);
}
/**
 * Update ejected mass physics
 * Ejected mass decelerates over time and eventually stops
 */
export function updateEjectedMassMovement(ejectedMass, deltaTime) {
    // Apply friction (ejected mass slows down quickly)
    ejectedMass.vx *= GAME_CONFIG.FRICTION;
    ejectedMass.vy *= GAME_CONFIG.FRICTION;
    // Update position
    ejectedMass.x += ejectedMass.vx * deltaTime;
    ejectedMass.y += ejectedMass.vy * deltaTime;
    // Clamp to world bounds
    clampEjectedMassToWorld(ejectedMass);
}
/**
 * Clamp blob position to world bounds (accounting for radius)
 */
function clampToWorld(blob) {
    const minX = blob.radius;
    const maxX = GAME_CONFIG.WORLD_WIDTH - blob.radius;
    const minY = blob.radius;
    const maxY = GAME_CONFIG.WORLD_HEIGHT - blob.radius;
    if (blob.x < minX) {
        blob.x = minX;
        blob.vx = 0;
    }
    else if (blob.x > maxX) {
        blob.x = maxX;
        blob.vx = 0;
    }
    if (blob.y < minY) {
        blob.y = minY;
        blob.vy = 0;
    }
    else if (blob.y > maxY) {
        blob.y = maxY;
        blob.vy = 0;
    }
}
/**
 * Clamp ejected mass position to world bounds
 */
function clampEjectedMassToWorld(ejectedMass) {
    const minX = ejectedMass.radius;
    const maxX = GAME_CONFIG.WORLD_WIDTH - ejectedMass.radius;
    const minY = ejectedMass.radius;
    const maxY = GAME_CONFIG.WORLD_HEIGHT - ejectedMass.radius;
    if (ejectedMass.x < minX) {
        ejectedMass.x = minX;
        ejectedMass.vx = 0;
    }
    else if (ejectedMass.x > maxX) {
        ejectedMass.x = maxX;
        ejectedMass.vx = 0;
    }
    if (ejectedMass.y < minY) {
        ejectedMass.y = minY;
        ejectedMass.vy = 0;
    }
    else if (ejectedMass.y > maxY) {
        ejectedMass.y = maxY;
        ejectedMass.vy = 0;
    }
}
/**
 * Update the split timer for a blob
 */
export function updateSplitTimer(blob, deltaTimeMs) {
    blob.timeSinceSplit += deltaTimeMs;
    blob.canMerge = blob.timeSinceSplit >= GAME_CONFIG.RECOMBINE_TIME_MS;
}
/**
 * Start exit hold for a blob
 */
export function startExitHold(blob) {
    blob.isExiting = true;
    blob.exitProgress = 0;
    blob.originalRadius = blob.radius;
}
/**
 * Cancel exit hold for a blob
 */
export function cancelExitHold(blob) {
    blob.isExiting = false;
    blob.exitProgress = 0;
    // Restore original radius
    blob.radius = massToRadius(blob.mass);
    blob.originalRadius = 0;
}
/**
 * Update exit progress for a blob
 * Returns true if exit is complete
 */
export function updateExitProgress(blob, exitStartedAt, exitHoldMs) {
    const elapsed = Date.now() - exitStartedAt;
    blob.exitProgress = Math.min(1, elapsed / exitHoldMs);
    return blob.exitProgress >= 1;
}
/**
 * Apply soft collision between same-player blobs
 * Blobs push apart to prevent overlap until they're ready to merge
 */
export function applySoftCollision(player) {
    const blobs = player.blobs;
    if (blobs.length < 2)
        return;
    for (let i = 0; i < blobs.length; i++) {
        for (let j = i + 1; j < blobs.length; j++) {
            const blobA = blobs.at(i);
            const blobB = blobs.at(j);
            if (!blobA || !blobB)
                continue;
            // Skip if both can merge (they'll merge instead of pushing apart)
            if (blobA.canMerge && blobB.canMerge) {
                continue;
            }
            resolveSoftCollision(blobA, blobB);
        }
    }
}
/**
 * Resolve soft collision between two blobs from the same player
 */
function resolveSoftCollision(blobA, blobB) {
    const dx = blobB.x - blobA.x;
    const dy = blobB.y - blobA.y;
    const dist = distance(blobA.x, blobA.y, blobB.x, blobB.y);
    const minDistance = blobA.radius + blobB.radius;
    // Only push apart if overlapping
    if (dist >= minDistance || dist === 0) {
        return;
    }
    const overlap = minDistance - dist;
    const pushDir = normalize(dx, dy);
    // If distance is 0, push in a random direction
    if (dist === 0) {
        const angle = Math.random() * Math.PI * 2;
        pushDir.x = Math.cos(angle);
        pushDir.y = Math.sin(angle);
    }
    const pushForce = overlap * GAME_CONFIG.SOFT_COLLISION_FORCE;
    const totalMass = blobA.mass + blobB.mass;
    // Mass-weighted push: lighter blob moves more
    const ratioA = blobB.mass / totalMass;
    const ratioB = blobA.mass / totalMass;
    blobA.vx -= pushDir.x * pushForce * ratioA;
    blobA.vy -= pushDir.y * pushForce * ratioA;
    blobB.vx += pushDir.x * pushForce * ratioB;
    blobB.vy += pushDir.y * pushForce * ratioB;
}
/**
 * Apply attraction force between same-player blobs
 * Force scales with merge timer progress
 */
export function applyAttraction(player, deltaTime) {
    if (player.blobs.length < 2)
        return;
    // Calculate center of mass
    let totalMass = 0;
    let centerX = 0;
    let centerY = 0;
    for (const blob of player.blobs) {
        totalMass += blob.mass;
        centerX += blob.x * blob.mass;
        centerY += blob.y * blob.mass;
    }
    centerX /= totalMass;
    centerY /= totalMass;
    // Apply attraction toward center of mass
    for (const blob of player.blobs) {
        const dx = centerX - blob.x;
        const dy = centerY - blob.y;
        const dist = vectorLength(dx, dy);
        // Don't apply attraction if very close (prevents jitter)
        if (dist < GAME_CONFIG.MIN_ATTRACT_DISTANCE) {
            continue;
        }
        const dir = normalize(dx, dy);
        // Timer progress: 0 (just split) → 1 (ready to merge)
        const timerProgress = Math.min(1, blob.timeSinceSplit / GAME_CONFIG.RECOMBINE_TIME_MS);
        // Attraction strength scales with timer progress
        const attractStrength = GAME_CONFIG.MAGNET_BASE_FORCE +
            (GAME_CONFIG.MAGNET_MAX_FORCE - GAME_CONFIG.MAGNET_BASE_FORCE) * timerProgress;
        // Apply force (scaled by distance for spring-like behavior)
        const force = Math.min(attractStrength * (dist / 100), GAME_CONFIG.MAGNET_MAX_FORCE);
        blob.vx += dir.x * force * deltaTime;
        blob.vy += dir.y * force * deltaTime;
    }
}
