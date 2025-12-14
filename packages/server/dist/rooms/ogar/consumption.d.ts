import type { PlayerNode, WorldNode } from "./types.js";
export type EatDecision = {
    preyId: number;
};
export declare function buildEatList(params: {
    eater: PlayerNode;
    candidates: WorldNode[];
}): EatDecision[];
