/**
 * Game Configuration Constants
 * 
 * All tunable gameplay parameters defined in ARCHITECTURE.md section 4.11.
 * These values control physics, eating, splitting, merging, and all game mechanics.
 */

export const GAME_CONFIG = {
  // ============================================
  // World & Tick
  // ============================================
  TICK_RATE: 20,                    // Server simulation ticks per second
  WORLD_WIDTH: 4000,                // World bounds (pixels)
  WORLD_HEIGHT: 4000,               // World bounds (pixels)

  // ============================================
  // Movement
  // ============================================
  BASE_SPEED: 300,                  // Base/max movement speed for smallest blobs
  SPEED_EXPONENT: 0.45,             // How aggressively speed decreases with mass
  MIN_SPEED: 50,                    // Speed floor for massive blobs
  ACCELERATION: 600,                // How quickly blobs accelerate toward cursor
  FRICTION: 0.92,                   // Velocity multiplier per tick (1 = no friction)

  // ============================================
  // Size & Eating
  // ============================================
  RADIUS_SCALE: 4,                  // Multiplier for sqrt(mass) → radius
  EAT_RADIUS_RATIO: 1.1,            // Radius must be this multiple to eat (10% larger)
  EAT_OVERLAP_FACTOR: 0.4,          // How much smaller blob must be inside larger

  // ============================================
  // Pellets
  // ============================================
  PELLET_MASS: 1,                   // Mass per pellet
  MAX_PELLETS: 1000,                // Maximum pellets on map
  PELLET_SPAWN_RATE: 10,            // Pellets spawned per second
  PELLET_RADIUS: 10,                // Visual radius of pellets

  // ============================================
  // Splitting
  // ============================================
  MAX_BLOBS: 4,                     // Max blobs per player
  SPLIT_COOLDOWN_MS: 500,           // Cooldown between splits
  MIN_SPLIT_MASS: 36,               // Minimum mass to split
  SPLIT_BOOST: 400,                 // Velocity burst on split

  // ============================================
  // Merging & Attraction
  // ============================================
  RECOMBINE_TIME_MS: 30000,         // Time before blobs can merge (30 seconds)
  MAGNET_BASE_FORCE: 0,             // Attraction strength immediately after split
  MAGNET_MAX_FORCE: 50,             // Attraction strength at full timer progress
  MIN_ATTRACT_DISTANCE: 10,         // Don't apply attraction closer than this
  SOFT_COLLISION_FORCE: 100,        // Push-apart strength for pre-merge overlap
  MERGE_OVERLAP_FACTOR: 0.3,        // How much blobs must overlap to merge

  // ============================================
  // Eject Mass
  // ============================================
  EJECT_MASS: 16,                   // Mass ejected per action
  EJECT_COOLDOWN_MS: 100,           // Cooldown between ejects
  MIN_EJECT_MASS: 32,               // Minimum mass to eject
  EJECT_SPEED: 500,                 // Velocity of ejected mass

  // ============================================
  // Hold-to-Exit
  // ============================================
  EXIT_HOLD_MS: 3000,               // Duration player must hold to cash out
  EXIT_SPEED_PENALTY: 0.5,          // Speed multiplier while exiting (50% = half speed)
  EXIT_MIN_RADIUS_FACTOR: 0.6,      // Radius shrinks to this factor at full hold (60%)

  // ============================================
  // Reconnect
  // ============================================
  RECONNECT_TIMEOUT_MS: 30000,      // Time window for reconnecting after disconnect (30 seconds)

  // ============================================
  // Spatial Grid (for collision optimization)
  // ============================================
  GRID_CELL_SIZE: 200,              // Size of spatial grid cells in pixels
} as const;

export type GameConfig = typeof GAME_CONFIG;

// Helper functions for common calculations
export function massToRadius(mass: number): number {
  return GAME_CONFIG.RADIUS_SCALE * Math.sqrt(mass);
}

export function radiusToMass(radius: number): number {
  return Math.pow(radius / GAME_CONFIG.RADIUS_SCALE, 2);
}

export function getMaxSpeed(mass: number): number {
  const speed = GAME_CONFIG.BASE_SPEED / Math.pow(mass, GAME_CONFIG.SPEED_EXPONENT);
  return Math.max(GAME_CONFIG.MIN_SPEED, Math.min(speed, GAME_CONFIG.BASE_SPEED));
}

