import { massToRadius, movementAngleRad, playerSpeedFromMass, distance, clamp } from "./math.js";
/**
 * Player cell movement: step-to-mouse with mass-based speed.
 *
 * Note: split burst momentum is handled separately via the move-engine update.
 * Split cells experience both the player movement step and move-engine movement
 * in the same tick.
 */
export function stepPlayerCellMovement(params) {
    const { cell, mouseX, mouseY, ownedCells, bounds } = params;
    const r = massToRadius(cell.mass);
    const dx = mouseX - cell.x;
    const dy = mouseY - cell.y;
    const angle = movementAngleRad(dx, dy);
    const distToMouse = distance(cell.x, cell.y, mouseX, mouseY);
    const step = Math.min(playerSpeedFromMass(cell.mass), distToMouse);
    let x1 = cell.x + step * Math.sin(angle);
    let y1 = cell.y + step * Math.cos(angle);
    // Same-owner collision push (pre-recombine):
    // Only adjusts the moving cell position, not the other cell.
    if (cell.ignoreCollisionTicks <= 0) {
        for (const other of ownedCells) {
            if (other.id === cell.id)
                continue;
            if (other.recombineSeconds > 0 || cell.recombineSeconds > 0) {
                const rOther = massToRadius(other.mass);
                const collisionDist = rOther + r;
                const dist = distance(x1, y1, other.x, other.y);
                if (dist < collisionDist) {
                    const ndy = y1 - other.y;
                    const ndx = x1 - other.x;
                    const a = movementAngleRad(ndx, ndy);
                    const move = collisionDist - dist;
                    x1 = Math.trunc(x1 + move * Math.sin(a));
                    y1 = Math.trunc(y1 + move * Math.cos(a));
                }
            }
        }
    }
    // Border clamp by radius/2.
    const half = r / 2;
    x1 = clamp(x1, bounds.left + half, bounds.right - half);
    y1 = clamp(y1, bounds.top + half, bounds.bottom - half);
    return { x: Math.trunc(x1), y: Math.trunc(y1), angleRad: angle };
}
export function isPlayerNode(node) {
    return node.kind === "player";
}
