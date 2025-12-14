import { GameState, Player, Blob, Pellet, EjectedMass } from "../schema/GameState.js";
import { SpatialGrid, SpatialEntity } from "./SpatialGrid.js";
/**
 * Eating System
 *
 * Handles blob-blob eating, blob-pellet eating, and blob-ejected mass eating.
 * Uses radius-based eating logic so exit-shrinking blobs become vulnerable.
 */
/**
 * Blob wrapper for spatial grid
 */
interface BlobEntity extends SpatialEntity {
    blob: Blob;
    player: Player;
}
/**
 * Process all eating interactions
 * Returns array of killed player sessionIds
 */
export declare function processEating(state: GameState, blobGrid: SpatialGrid<BlobEntity>, pelletGrid: SpatialGrid<Pellet>, ejectedMassGrid: SpatialGrid<EjectedMass>): string[];
/**
 * Update player's total mass from all their blobs
 */
export declare function updatePlayerMass(player: Player): void;
export {};
