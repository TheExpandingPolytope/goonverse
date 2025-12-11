import { randomUUID } from "crypto";
import { Player, Blob } from "../schema/GameState.js";
import { GAME_CONFIG, massToRadius } from "../../gameConfig.js";
import { normalize, vectorLength } from "../utils/PhysicsUtils.js";
import { updatePlayerMass } from "./EatingSystem.js";
import { canMerge } from "./CollisionDetection.js";

/**
 * Split & Merge System
 * 
 * Handles blob splitting and merging.
 * Attraction logic has been moved to PhysicsSystem.
 */

/**
 * Generate a unique blob ID
 */
function generateBlobId(owner: string): string {
  return `${owner}_blob_${randomUUID()}`;
}

/**
 * Try to split a blob
 * Returns true if split was successful
 */
export function trySplit(player: Player, blob: Blob, targetX: number, targetY: number): boolean {
  const now = Date.now();

  // Check cooldown
  if (now - blob.lastSplitTime < GAME_CONFIG.SPLIT_COOLDOWN_MS) {
    return false;
  }

  // Check max blobs
  if (player.blobs.length >= GAME_CONFIG.MAX_BLOBS) {
    return false;
  }

  // Check minimum mass
  if (blob.mass < GAME_CONFIG.MIN_SPLIT_MASS) {
    return false;
  }

  // Calculate split direction (toward cursor)
  const dx = targetX - blob.x;
  const dy = targetY - blob.y;
  const dir = normalize(dx, dy);
  
  // If cursor is on blob, split in a default direction
  if (vectorLength(dx, dy) < 1) {
    dir.x = 1;
    dir.y = 0;
  }

  // Create new blob with half the mass
  const newMass = blob.mass / 2;
  blob.mass = newMass;
  blob.radius = massToRadius(newMass);

  const newBlob = new Blob();
  newBlob.id = generateBlobId(blob.owner);
  newBlob.owner = blob.owner;
  newBlob.x = blob.x;
  newBlob.y = blob.y;
  newBlob.mass = newMass;
  newBlob.radius = massToRadius(newMass);
  newBlob.targetX = targetX;
  newBlob.targetY = targetY;

  // Apply velocity burst to the new blob (it gets shot forward)
  newBlob.vx = dir.x * GAME_CONFIG.SPLIT_BOOST;
  newBlob.vy = dir.y * GAME_CONFIG.SPLIT_BOOST;

  // Parent blob gets a small recoil
  blob.vx -= dir.x * GAME_CONFIG.SPLIT_BOOST * 0.2;
  blob.vy -= dir.y * GAME_CONFIG.SPLIT_BOOST * 0.2;

  // Reset merge timers
  blob.timeSinceSplit = 0;
  blob.canMerge = false;
  blob.lastSplitTime = now;

  newBlob.timeSinceSplit = 0;
  newBlob.canMerge = false;
  newBlob.lastSplitTime = now;

  // Add new blob to player
  player.blobs.push(newBlob);

  return true;
}

/**
 * Process merging for a player's blobs
 * Returns true if any merges occurred
 */
export function processMerging(player: Player): boolean {
  if (player.blobs.length < 2) return false;

  let merged = false;
  const blobsToRemove: Set<string> = new Set();

  // Check all pairs for merging
  for (let i = 0; i < player.blobs.length; i++) {
    const blobA = player.blobs.at(i);
    if (!blobA) continue;
    if (blobsToRemove.has(blobA.id)) continue;
    if (!blobA.canMerge) continue;

    for (let j = i + 1; j < player.blobs.length; j++) {
      const blobB = player.blobs.at(j);
      if (!blobB) continue;
      if (blobsToRemove.has(blobB.id)) continue;
      if (!blobB.canMerge) continue;

      // Check if overlapping enough to merge
      if (canMerge(blobA, blobB)) {
        // Merge smaller into larger
        const survivor = blobA.mass >= blobB.mass ? blobA : blobB;
        const absorbed = blobA.mass >= blobB.mass ? blobB : blobA;

        mergeBlobs(survivor, absorbed);
        blobsToRemove.add(absorbed.id);
        merged = true;
      }
    }
  }

  // Remove absorbed blobs
  if (blobsToRemove.size > 0) {
    const newBlobs = player.blobs.filter(b => !blobsToRemove.has(b.id));
    player.blobs.splice(0, player.blobs.length);
    for (const blob of newBlobs) {
      player.blobs.push(blob);
    }
    updatePlayerMass(player);
  }

  return merged;
}

/**
 * Merge absorbed blob into survivor
 */
function mergeBlobs(survivor: Blob, absorbed: Blob): void {
  // Combine mass
  const totalMass = survivor.mass + absorbed.mass;

  // Calculate weighted center
  const weightedX = (survivor.x * survivor.mass + absorbed.x * absorbed.mass) / totalMass;
  const weightedY = (survivor.y * survivor.mass + absorbed.y * absorbed.mass) / totalMass;

  // Update survivor
  survivor.mass = totalMass;
  survivor.x = weightedX;
  survivor.y = weightedY;
  survivor.radius = massToRadius(totalMass);

  // Average velocities (weighted)
  survivor.vx = (survivor.vx * survivor.mass + absorbed.vx * absorbed.mass) / totalMass;
  survivor.vy = (survivor.vy * survivor.mass + absorbed.vy * absorbed.mass) / totalMass;

  // Reset merge timer (can't immediately split again, but that's handled by split cooldown)
  survivor.timeSinceSplit = 0;
  survivor.canMerge = false;
}

/**
 * Try to split all eligible blobs for a player
 * Used when player presses split - splits all blobs that can split
 */
export function trySplitAll(player: Player, targetX: number, targetY: number): boolean {
  let anySplit = false;

  // Get current blobs (copy array since we're modifying it)
  const currentBlobs = [...player.blobs];

  for (const blob of currentBlobs) {
    if (trySplit(player, blob, targetX, targetY)) {
      anySplit = true;
    }
  }

  return anySplit;
}
