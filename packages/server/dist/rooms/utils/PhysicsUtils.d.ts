/**
 * Physics Utils
 *
 * Shared math and physics utility functions.
 */
/**
 * Helper to calculate squared distance between two points
 */
export declare function distanceSquared(x1: number, y1: number, x2: number, y2: number): number;
/**
 * Helper to calculate distance between two points
 */
export declare function distance(x1: number, y1: number, x2: number, y2: number): number;
/**
 * Normalize a vector
 */
export declare function normalize(x: number, y: number): {
    x: number;
    y: number;
};
/**
 * Get the length of a vector
 */
export declare function vectorLength(x: number, y: number): number;
