import type { MoveEngine, WorldBounds } from "./types.js";
export declare function stepMoveEngine(pos: {
    x: number;
    y: number;
}, move: MoveEngine, bounds: WorldBounds): {
    x: number;
    y: number;
    move: MoveEngine;
};
