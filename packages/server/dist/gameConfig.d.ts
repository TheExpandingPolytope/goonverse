/**
 * Game Configuration Constants
 *
 * All tunable gameplay parameters defined in ARCHITECTURE.md section 4.11.
 * These values control physics, eating, splitting, merging, and all game mechanics.
 */
export declare const GAME_CONFIG: {
    readonly TICK_RATE: 20;
    readonly WORLD_WIDTH: 4000;
    readonly WORLD_HEIGHT: 4000;
    readonly BASE_SPEED: 300;
    readonly SPEED_EXPONENT: 0.45;
    readonly MIN_SPEED: 50;
    readonly ACCELERATION: 600;
    readonly FRICTION: 0.92;
    readonly RADIUS_SCALE: 4;
    readonly EAT_RADIUS_RATIO: 1.1;
    readonly EAT_OVERLAP_FACTOR: 0.4;
    readonly PELLET_MASS: 1;
    readonly MAX_PELLETS: 1000;
    readonly PELLET_SPAWN_RATE: 10;
    readonly PELLET_RADIUS: 10;
    readonly MAX_BLOBS: 4;
    readonly SPLIT_COOLDOWN_MS: 500;
    readonly MIN_SPLIT_MASS: 36;
    readonly SPLIT_BOOST: 400;
    readonly RECOMBINE_TIME_MS: 30000;
    readonly MAGNET_BASE_FORCE: 0;
    readonly MAGNET_MAX_FORCE: 50;
    readonly MIN_ATTRACT_DISTANCE: 10;
    readonly SOFT_COLLISION_FORCE: 100;
    readonly MERGE_OVERLAP_FACTOR: 0.3;
    readonly EJECT_MASS: 16;
    readonly EJECT_COOLDOWN_MS: 100;
    readonly MIN_EJECT_MASS: 32;
    readonly EJECT_SPEED: 500;
    readonly EXIT_HOLD_MS: 3000;
    readonly EXIT_SPEED_PENALTY: 0.5;
    readonly EXIT_MIN_RADIUS_FACTOR: 0.6;
    readonly RECONNECT_TIMEOUT_MS: 30000;
    readonly GRID_CELL_SIZE: 200;
};
export type GameConfig = typeof GAME_CONFIG;
export declare function massToRadius(mass: number): number;
export declare function radiusToMass(radius: number): number;
export declare function getMaxSpeed(mass: number): number;
