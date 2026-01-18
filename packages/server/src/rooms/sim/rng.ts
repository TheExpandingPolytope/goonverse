export type RngState = {
  seed: number;
};

// Simple LCG for deterministic gameplay randomness.
export function createRng(seed: number): RngState {
  return { seed: seed >>> 0 };
}

export function nextFloat(rng: RngState): number {
  // LCG parameters (Numerical Recipes)
  rng.seed = (rng.seed * 1664525 + 1013904223) >>> 0;
  return rng.seed / 0xffffffff;
}

export function nextRange(rng: RngState, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min);
}

export function nextInt(rng: RngState, min: number, max: number): number {
  return Math.floor(nextRange(rng, min, max + 1));
}
