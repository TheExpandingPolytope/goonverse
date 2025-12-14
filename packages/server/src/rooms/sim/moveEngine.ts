import type { MoveEngine, WorldBounds } from "./types.js";
import { reflectAngleHorizontal, reflectAngleVertical } from "./math.js";
import { FFA_CONFIG } from "./config.js";

export function stepMoveEngine(
  pos: { x: number; y: number },
  move: MoveEngine,
  bounds: WorldBounds,
): { x: number; y: number; move: MoveEngine } {
  // X = x + speed*sin(angle); Y = y + speed*cos(angle)
  let nextX = pos.x + move.speed * Math.sin(move.angleRad);
  let nextY = pos.y + move.speed * Math.cos(move.angleRad);

  // Decay and tick down (compute next pos first, then decay/decrement)
  const nextMove: MoveEngine = {
    angleRad: move.angleRad,
    speed: move.speed * move.decay,
    ticksRemaining: move.ticksRemaining - 1,
    decay: move.decay,
  };

  // Border bounce uses a fixed radius constant, and checks against the *current* position.
  const r = FFA_CONFIG.moveEngineBounceRadius;

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


