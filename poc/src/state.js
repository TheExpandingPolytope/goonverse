/**
 * Global game state
 * Balance values in CENTS
 */
import { CONFIG } from './config.js';

export const state = {
    gameState: 'playing',
    entities: [],
    particles: [],
    bullets: [],
    obstacles: [],
    floatTexts: [],
    shockwaves: [],
    stars: [],
    camera: { x: 0, y: 0, zoom: 1 },
    // Dynamic world border (circle)
    playersInWorld: 0,
    borderRadius: CONFIG.worldRadiusMin,
    borderTargetRadius: CONFIG.worldRadiusMin,
    borderVelocity: 0, // world-units/sec (positive expanding, negative shrinking)

    // Bot spawn pacing (tick-based, deterministic)
    botSpawnQueue: [], // array of dueTick numbers
    nextBotSpawnTick: 0,

    // Background deco shapes (visual-only)
    decoShapes: [],
    worldReserve: CONFIG.initialReserve, // In CENTS
    passiveReserve: CONFIG.initialReserve, // Tracks passive-only funds (seed + passive burn)
    
    // Accumulators for passive economy
    baseBurnSinceLastSpawn: 0, // Accumulates passive tax between spawn checks
    spawnCarry: 0,             // Accumulates spawn budget (replaces trickle carry)
    
    shakeAmount: 0,
    hitStop: 0
};

export const input = {
    mouse: { x: 0, y: 0 },
    lmb: false,
    rmb: false,
    lmbStart: 0,
    dashHoldStart: 0,
    keys: { w: false, a: false, s: false, d: false, space: false, q: false }
};

// Canvas context (set during init)
export let canvas = null;
export let ctx = null;
export let width = 0;
export let height = 0;

export function setCanvas(c) {
    canvas = c;
    ctx = c.getContext('2d');
}

export function setDimensions(w, h) {
    width = w;
    height = h;
}

// Helper to get player entity
export function getPlayer() {
    return state.entities.find(e => e.type === 'player');
}

// Reset state for new game
export function resetState() {
    state.entities = [];
    state.bullets = [];
    state.particles = [];
    state.floatTexts = [];
    state.shockwaves = [];
    state.obstacles = [];
    state.worldReserve = CONFIG.initialReserve;
    state.passiveReserve = CONFIG.initialReserve;
    state.baseBurnSinceLastSpawn = 0;
    state.spawnCarry = 0;
    state.playersInWorld = 0;
    state.borderRadius = CONFIG.worldRadiusMin;
    state.borderTargetRadius = CONFIG.worldRadiusMin;
    state.borderVelocity = 0;
    state.botSpawnQueue = [];
    state.nextBotSpawnTick = 0;
    state.decoShapes = [];
    state.shakeAmount = 0;
    state.hitStop = 0;
    state.gameState = 'playing';
}
