import { OGAR_FFA_CONFIG } from "./config.js";

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function massToRadius(mass: number): number {
  // Ogar3: ceil(sqrt(100 * mass))
  return Math.ceil(Math.sqrt(100 * mass));
}

export function massToSquareSize(mass: number): number {
  // Ogar3: (100 * mass) >> 0
  return Math.trunc(100 * mass);
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function randIntInclusive(min: number, max: number): number {
  const r = Math.random();
  return Math.floor(r * (max - min + 1)) + min;
}

export function randomAngleRad(): number {
  return Math.random() * Math.PI * 2;
}

export function ogarPlayerSpeed(mass: number, tickMs: number = OGAR_FFA_CONFIG.tickMs): number {
  // Ogar3: playerSpeed * mass^(-1/4.5) * 50/40 (with 50ms ticks)
  // Generalized: * tickMs/40.
  return OGAR_FFA_CONFIG.playerSpeed * Math.pow(mass, -1.0 / 4.5) * (tickMs / 40);
}

export function ogarAngleRad(dx: number, dy: number): number {
  // Ogar3 uses atan2(deltaX, deltaY) and then applies sin(angle) to X, cos(angle) to Y.
  return Math.atan2(dx, dy);
}

export function reflectAngleHorizontal(angleRad: number): number {
  // Ogar3 uses 6.28 - angle
  return 6.28 - angleRad;
}

export function reflectAngleVertical(angleRad: number): number {
  // Ogar3: (angle <= 3.14) ? 3.14 - angle : 9.42 - angle
  return angleRad <= 3.14 ? 3.14 - angleRad : 9.42 - angleRad;
}


