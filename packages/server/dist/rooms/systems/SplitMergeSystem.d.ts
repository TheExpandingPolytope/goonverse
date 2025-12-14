import { Player, Blob } from "../schema/GameState.js";
/**
 * Try to split a blob
 * Returns true if split was successful
 */
export declare function trySplit(player: Player, blob: Blob, targetX: number, targetY: number): boolean;
/**
 * Process merging for a player's blobs
 * Returns true if any merges occurred
 */
export declare function processMerging(player: Player): boolean;
/**
 * Try to split all eligible blobs for a player
 * Used when player presses split - splits all blobs that can split
 */
export declare function trySplitAll(player: Player, targetX: number, targetY: number): boolean;
