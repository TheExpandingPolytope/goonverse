import { SIM_CONFIG } from "./config.js";
import type { RngState } from "./rng.js";
import { nextInt, nextRange } from "./rng.js";

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  if (a === b) return 0;
  return clamp((v - a) / (b - a), 0, 1);
}

export function distanceSq(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(distanceSq(x1, y1, x2, y2));
}

export function segmentCircleIntersects(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  radius: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-6) {
    return distanceSq(x1, y1, cx, cy) <= radius * radius;
  }
  const t = clamp(((cx - x1) * dx + (cy - y1) * dy) / lenSq, 0, 1);
  const px = x1 + dx * t;
  const py = y1 + dy * t;
  return distanceSq(px, py, cx, cy) <= radius * radius;
}

export function tickSeconds(): number {
  return SIM_CONFIG.tickMs / 1000;
}

export function massToRadius(mass: number, spawnMass: number): number {
  const massNorm = Math.max(0.01, mass / Math.max(1, spawnMass));
  const radius = Math.pow(massNorm, SIM_CONFIG.radiusExponent) * SIM_CONFIG.radiusAtSpawn;
  return clamp(radius, SIM_CONFIG.radiusMin, SIM_CONFIG.radiusMax);
}

export function mobilityMultiplier(radius: number): number {
  // POC parity: mobility has a baseline factor so the overall speed/accel "feel"
  // matches the PoC tuning at the reference radius.
  // In the PoC:
  //   baselineFactor = 12 / sqrt(radiusRef)
  //   mult = baselineFactor * clamp((radiusRef / r)^exponent, min, max)
  const r = Math.max(1, radius);
  const ratio = SIM_CONFIG.mobilityRadiusRef / r;
  const raw = Math.pow(ratio, SIM_CONFIG.mobilityExponent);
  const clamped = clamp(raw, SIM_CONFIG.mobilityMin, SIM_CONFIG.mobilityMax);
  const baselineFactor = 12 / Math.sqrt(SIM_CONFIG.mobilityRadiusRef);
  return baselineFactor * clamped;
}

export function randRange(rng: RngState, min: number, max: number): number {
  return nextRange(rng, min, max);
}

export function randIntInclusive(rng: RngState, min: number, max: number): number {
  return nextInt(rng, min, max);
}

export function randomAngleRad(rng: RngState): number {
  return nextRange(rng, 0, Math.PI * 2);
}


