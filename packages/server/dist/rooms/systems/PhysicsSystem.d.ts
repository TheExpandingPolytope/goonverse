import { Blob, Player, EjectedMass } from "../schema/GameState.js";
/**
 * Physics System
 *
 * Handles movement, acceleration, friction, and world bounds for all entities.
 * Includes forces like soft collision (push) and attraction (pull).
 * Server is fully authoritative - client only sends input targets.
 */
/**
 * Update blob movement toward target position
 * Applies acceleration, friction, and mass-based speed cap
 */
export declare function updateBlobMovement(blob: Blob, deltaTime: number): void;
/**
 * Update ejected mass physics
 * Ejected mass decelerates over time and eventually stops
 */
export declare function updateEjectedMassMovement(ejectedMass: EjectedMass, deltaTime: number): void;
/**
 * Update the split timer for a blob
 */
export declare function updateSplitTimer(blob: Blob, deltaTimeMs: number): void;
/**
 * Start exit hold for a blob
 */
export declare function startExitHold(blob: Blob): void;
/**
 * Cancel exit hold for a blob
 */
export declare function cancelExitHold(blob: Blob): void;
/**
 * Update exit progress for a blob
 * Returns true if exit is complete
 */
export declare function updateExitProgress(blob: Blob, exitStartedAt: number, exitHoldMs: number): boolean;
/**
 * Apply soft collision between same-player blobs
 * Blobs push apart to prevent overlap until they're ready to merge
 */
export declare function applySoftCollision(player: Player): void;
/**
 * Apply attraction force between same-player blobs
 * Force scales with merge timer progress
 */
export declare function applyAttraction(player: Player, deltaTime: number): void;
