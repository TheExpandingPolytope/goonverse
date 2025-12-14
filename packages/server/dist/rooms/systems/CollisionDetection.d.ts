import { Blob } from "../schema/GameState.js";
/**
 * Collision Detection
 *
 * Pure geometry and rule checks for collisions.
 * Does NOT modify state.
 */
/**
 * Check if two circles overlap
 */
export declare function circlesOverlap(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number): boolean;
/**
 * Check if two blobs are overlapping enough to trigger eating
 */
export declare function checkEatOverlap(eater: Blob, prey: Blob): boolean;
/**
 * Check if eater can eat prey based on radius and overlap
 * Uses radius (not mass) so exit-shrinking blobs become vulnerable
 */
export declare function canEat(eater: Blob, prey: Blob): boolean;
/**
 * Check if a blob can eat a pellet
 */
export declare function canEatPellet(blob: Blob, pelletX: number, pelletY: number, pelletRadius: number): boolean;
/**
 * Check if two blobs can merge
 */
export declare function canMerge(blobA: Blob, blobB: Blob): boolean;
