import type { FoodNode, PlayerSim, WorldBounds, WorldNode } from "./types.js";
export type EngineEvent = {
    type: "playerDied";
    sessionId: string;
} | {
    type: "foodRemoved";
    mass: number;
} | {
    type: "ejectedRemoved";
    mass: number;
} | {
    type: "massDecayed";
    mass: number;
} | {
    type: "ejectedFedVirus";
    mass: number;
};
export type EngineTickResult = {
    events: EngineEvent[];
};
export declare class OgarFfaEngine {
    readonly bounds: WorldBounds;
    private nextNodeId;
    private tick;
    readonly players: Map<string, PlayerSim>;
    readonly nodes: Map<number, WorldNode>;
    readonly playerNodeIds: number[];
    readonly movingNodeIds: number[];
    readonly virusNodeIds: number[];
    readonly ejectedNodeIds: number[];
    readonly foodNodeIds: number[];
    constructor();
    private newNodeId;
    private randomColor;
    addPlayer(params: {
        sessionId: string;
        wallet: `0x${string}`;
        displayName: string;
        spawnMass: number;
    }): PlayerSim;
    getPlayer(sessionId: string): PlayerSim | undefined;
    /**
     * Find a player by wallet. O(n) over active players (fine at our scale).
     */
    findPlayerByWallet(wallet: `0x${string}`): PlayerSim | undefined;
    /**
     * Update a player's sessionId (used for reconnects), and re-home all owned nodes.
     */
    rekeyPlayerSession(oldSessionId: string, newSessionId: string): boolean;
    /**
     * Total mass across all owned player cells.
     */
    getPlayerTotalMass(sessionId: string): number;
    /**
     * Remove player + owned nodes from the world (e.g., on exit or timed-out disconnect).
     */
    removePlayer(sessionId: string): void;
    setInput(sessionId: string, input: Partial<PlayerSim["input"]>): void;
    /**
     * Main tick step (50ms).
     */
    step(): EngineTickResult;
    /**
     * External spawner hook: call on your desired schedule (e.g., every 20 ticks).
     * Food spawning should be gated by pelletReserveWei outside the engine.
     */
    spawnFoodBatch(): void;
    spawnInitialFood(): void;
    spawnRandomFood(mass?: number): FoodNode;
    ensureVirusMin(): void;
    private splitAllEligible;
    private ejectAllEligible;
    private consume;
    private applyMassGain;
    private popByVirus;
    private spawnVirusedCell;
    private calcRecombineSeconds;
    private removeNode;
    private removeFromList;
    private trySpawnVirus;
    private tryFeedVirus;
    private shootVirus;
    private oneSecondUpdate;
}
