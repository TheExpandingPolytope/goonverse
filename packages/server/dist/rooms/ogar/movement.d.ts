import type { PlayerNode, WorldBounds, WorldNode } from "./types.js";
/**
 * Ogar3-style player cell movement: step-to-mouse with mass-based speed.
 *
 * Note: split burst momentum is handled separately via the move-engine update.
 * In Ogar3, split cells experience both the player movement step and move-engine
 * movement in the same tick.
 */
export declare function stepPlayerCellMovement(params: {
    cell: PlayerNode;
    mouseX: number;
    mouseY: number;
    ownedCells: PlayerNode[];
    bounds: WorldBounds;
}): {
    x: number;
    y: number;
    angleRad: number;
};
export declare function isPlayerNode(node: WorldNode): node is PlayerNode;
