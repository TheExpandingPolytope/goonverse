/**
 * Physics Utils
 *
 * Shared math and physics utility functions.
 */
/**
 * Helper to calculate squared distance between two points
 */
export function distanceSquared(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
}
/**
 * Helper to calculate distance between two points
 */
export function distance(x1, y1, x2, y2) {
    return Math.sqrt(distanceSquared(x1, y1, x2, y2));
}
/**
 * Normalize a vector
 */
export function normalize(x, y) {
    const len = Math.sqrt(x * x + y * y);
    if (len === 0)
        return { x: 0, y: 0 };
    return { x: x / len, y: y / len };
}
/**
 * Get the length of a vector
 */
export function vectorLength(x, y) {
    return Math.sqrt(x * x + y * y);
}
