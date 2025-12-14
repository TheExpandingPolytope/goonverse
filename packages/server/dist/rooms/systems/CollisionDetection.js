import { GAME_CONFIG } from "../../gameConfig.js";
import { distance, distanceSquared } from "../utils/PhysicsUtils.js";
/**
 * Collision Detection
 *
 * Pure geometry and rule checks for collisions.
 * Does NOT modify state.
 */
/**
 * Check if two circles overlap
 */
export function circlesOverlap(x1, y1, r1, x2, y2, r2) {
    const minDist = r1 + r2;
    return distanceSquared(x1, y1, x2, y2) < minDist * minDist;
}
/**
 * Check if two blobs are overlapping enough to trigger eating
 */
export function checkEatOverlap(eater, prey) {
    const dist = distance(eater.x, eater.y, prey.x, prey.y);
    // Prey must be mostly inside eater
    return dist < eater.radius - prey.radius * GAME_CONFIG.EAT_OVERLAP_FACTOR;
}
/**
 * Check if eater can eat prey based on radius and overlap
 * Uses radius (not mass) so exit-shrinking blobs become vulnerable
 */
export function canEat(eater, prey) {
    // Eater's radius must be at least 10% larger than prey's radius
    if (eater.radius <= prey.radius * GAME_CONFIG.EAT_RADIUS_RATIO) {
        return false;
    }
    // Check overlap
    return checkEatOverlap(eater, prey);
}
/**
 * Check if a blob can eat a pellet
 */
export function canEatPellet(blob, pelletX, pelletY, pelletRadius) {
    const dist = distance(blob.x, blob.y, pelletX, pelletY);
    // Blob just needs to overlap with pellet
    return dist < blob.radius + pelletRadius;
}
/**
 * Check if two blobs can merge
 */
export function canMerge(blobA, blobB) {
    // Both must be merge-eligible
    if (!blobA.canMerge || !blobB.canMerge) {
        return false;
    }
    // Check overlap
    const dist = distance(blobA.x, blobA.y, blobB.x, blobB.y);
    const minMergeDist = (blobA.radius + blobB.radius) * GAME_CONFIG.MERGE_OVERLAP_FACTOR;
    return dist < minMergeDist;
}
