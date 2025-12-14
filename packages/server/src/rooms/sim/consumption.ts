import type { PlayerNode, WorldNode } from "./types.js";
import { massToRadius, massToSquareSize, distance } from "./math.js";

export type EatDecision = {
  preyId: number;
};

export function buildEatList(params: {
  eater: PlayerNode;
  candidates: WorldNode[];
}): EatDecision[] {
  const { eater, candidates } = params;

  const eaterSquare = massToSquareSize(eater.mass);
  const eaterRadius = massToRadius(eater.mass);

  const out: EatDecision[] = [];

  for (const prey of candidates) {
    if (prey.id === eater.id) continue;

    // Broadphase squared-distance check.
    const dx = prey.x - eater.x;
    const dy = prey.y - eater.y;

    if (prey.kind === "food") {
      // Food special-case: dx^2 + dy^2 + 1 <= eaterSquare
      if (dx * dx + dy * dy + 1 > eaterSquare) continue;
      out.push({ preyId: prey.id });
      continue;
    }

    const preyMassForSquare =
      prey.kind === "virus" ? prey.sizeMass : prey.kind === "player" ? prey.mass : prey.mass;
    const preySquare = massToSquareSize(preyMassForSquare);
    if (dx * dx + dy * dy + preySquare > eaterSquare) continue;

    // Mass multiplier gate
    let multiplier = 1.25;

    if (prey.kind === "virus") {
      multiplier = 1.33;
    } else if (prey.kind === "player") {
      if (prey.ownerSessionId === eater.ownerSessionId) {
        // Can't merge until recombine timers expire
        if (prey.recombineSeconds > 0 || eater.recombineSeconds > 0) {
          continue;
        }
        multiplier = 1.0;
      }
    } else {
      // ejected uses default multiplier (1.25)
    }

    const preyMassForGate = prey.kind === "virus" ? prey.sizeMass : prey.mass;
    if (preyMassForGate * multiplier > eater.mass) continue;

    // Engulf distance gate
    let preyEatingRange = 0;
    if (prey.kind === "player") {
      preyEatingRange = massToRadius(prey.mass) * 0.4;
    } else if (prey.kind === "virus") {
      preyEatingRange = massToRadius(prey.sizeMass) * 0.4;
    }

    const dist = distance(eater.x, eater.y, prey.x, prey.y);
    const eatingRange = eaterRadius - preyEatingRange;
    if (dist > eatingRange) continue;

    out.push({ preyId: prey.id });
  }

  return out;
}


