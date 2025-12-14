import { GameState, Blob, EjectedMass } from "../schema/GameState.js";
/**
 * Try to eject mass from a blob
 * Returns the created EjectedMass if successful, null otherwise
 */
export declare function tryEject(state: GameState, blob: Blob, targetX: number, targetY: number): EjectedMass | null;
/**
 * Try to eject from all blobs of a player
 * Returns array of created ejected masses
 */
export declare function tryEjectAll(state: GameState, blobs: Blob[], targetX: number, targetY: number): EjectedMass[];
