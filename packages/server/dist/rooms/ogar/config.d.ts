/**
 * Ogar3 FFA parity constants.
 *
 * These are derived from Ogar3's `gameserver.ini` defaults and the hardcoded
 * behaviors in its JS implementation. We keep them in one place so gameplay
 * parity can be audited and tuned deliberately.
 */
export declare const OGAR_FFA_CONFIG: {
    readonly tickMs: 50;
    readonly borderLeft: 0;
    readonly borderRight: 6000;
    readonly borderTop: 0;
    readonly borderBottom: 6000;
    readonly viewBaseX: 1024;
    readonly viewBaseY: 592;
    readonly spawnIntervalTicks: 20;
    readonly foodSpawnAmount: 10;
    readonly foodStartAmount: 100;
    readonly foodMaxAmount: 500;
    readonly foodMinMass: 1;
    readonly foodMaxMass: 4;
    readonly virusMinAmount: 10;
    readonly virusMaxAmount: 50;
    readonly virusSizeMass: 100;
    readonly virusFeedAmount: 7;
    readonly virusShotSpeed: 200;
    readonly virusShotTicks: 20;
    readonly ejectMass: 12;
    readonly ejectMassLoss: 16;
    readonly ejectSpeed: 160;
    readonly ejectTicks: 20;
    readonly ejectAngleJitterRad: 0.2;
    readonly playerStartMass: 10;
    readonly playerMaxMass: 22500;
    readonly playerSpeed: 30;
    readonly playerSplitSpeedMultiplier: 6;
    readonly playerPopSplitSpeedMultiplier: 1;
    readonly playerMinMassEject: 32;
    readonly playerMinMassSplit: 36;
    readonly playerMaxCells: 16;
    readonly playerRecombineTimeSec: 30;
    readonly playerSmoothSplit: true;
    readonly smoothSplitNoCollideTicks: 8;
    readonly playerMassDecayRatePerSec: 0.002;
    readonly playerMinMassDecay: 9;
    readonly moveEngineBounceRadius: 40;
};
