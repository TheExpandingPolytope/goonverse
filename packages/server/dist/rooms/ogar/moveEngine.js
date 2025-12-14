import { reflectAngleHorizontal, reflectAngleVertical } from "./math.js";
import { OGAR_FFA_CONFIG } from "./config.js";
export function stepMoveEngine(pos, move, bounds) {
    // Ogar3: X = x + speed*sin(angle); Y = y + speed*cos(angle)
    let nextX = pos.x + move.speed * Math.sin(move.angleRad);
    let nextY = pos.y + move.speed * Math.cos(move.angleRad);
    // Decay and tick down (matches Ogar3 ordering: compute next pos first, then decay/decrement)
    const nextMove = {
        angleRad: move.angleRad,
        speed: move.speed * move.decay,
        ticksRemaining: move.ticksRemaining - 1,
        decay: move.decay,
    };
    // Border bounce uses a fixed radius constant in Ogar3 (~40), and checks against the *current* position.
    const r = OGAR_FFA_CONFIG.moveEngineBounceRadius;
    if (pos.x - r < bounds.left) {
        nextMove.angleRad = reflectAngleHorizontal(nextMove.angleRad);
        nextX = bounds.left + r;
    }
    if (pos.x + r > bounds.right) {
        nextMove.angleRad = reflectAngleHorizontal(nextMove.angleRad);
        nextX = bounds.right - r;
    }
    if (pos.y - r < bounds.top) {
        nextMove.angleRad = reflectAngleVertical(nextMove.angleRad);
        nextY = bounds.top + r;
    }
    if (pos.y + r > bounds.bottom) {
        nextMove.angleRad = reflectAngleVertical(nextMove.angleRad);
        nextY = bounds.bottom - r;
    }
    return {
        x: Math.trunc(nextX),
        y: Math.trunc(nextY),
        move: nextMove,
    };
}
