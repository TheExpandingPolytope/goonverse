/**
 * Ogar3 FFA parity constants.
 *
 * These are derived from Ogar3's `gameserver.ini` defaults and the hardcoded
 * behaviors in its JS implementation. We keep them in one place so gameplay
 * parity can be audited and tuned deliberately.
 */
export const OGAR_FFA_CONFIG = {
    // Tick
    tickMs: 50, // 20Hz
    // World bounds
    borderLeft: 0,
    borderRight: 6000,
    borderTop: 0,
    borderBottom: 6000,
    // View (interest management)
    viewBaseX: 1024,
    viewBaseY: 592,
    // Food (pellets)
    spawnIntervalTicks: 20, // every 20 ticks (~1s)
    foodSpawnAmount: 10,
    foodStartAmount: 100,
    foodMaxAmount: 500,
    foodMinMass: 1,
    foodMaxMass: 4, // food mass is random in [foodMinMass, foodMinMass + foodMaxMass - 1]
    // Viruses
    virusMinAmount: 10,
    virusMaxAmount: 50,
    virusSizeMass: 100, // used for radius/eligibility checks (virus is massless economically)
    virusFeedAmount: 7,
    virusShotSpeed: 200,
    virusShotTicks: 20,
    // Eject
    ejectMass: 12,
    ejectMassLoss: 16,
    ejectSpeed: 160,
    ejectTicks: 20,
    ejectAngleJitterRad: 0.2,
    // Player
    playerStartMass: 10, // NOTE: in our game this is overridden by deposit-derived spawn mass
    playerMaxMass: 22500,
    playerSpeed: 30,
    playerSplitSpeedMultiplier: 6,
    playerPopSplitSpeedMultiplier: 1,
    playerMinMassEject: 32,
    playerMinMassSplit: 36,
    playerMaxCells: 16,
    playerRecombineTimeSec: 30,
    playerSmoothSplit: true,
    smoothSplitNoCollideTicks: 8,
    // Decay
    playerMassDecayRatePerSec: 0.002,
    playerMinMassDecay: 9,
    // Move engine (split/eject/virus shot) border bounce radius constant in Ogar3
    moveEngineBounceRadius: 40,
};
