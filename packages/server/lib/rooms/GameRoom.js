"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameRoom = void 0;
const colyseus_1 = require("colyseus");
const GameState_1 = require("./schema/GameState");
const MAX_PELLETS = 500;
const PELLET_MASS = 1;
const MPD = 100; // Mass Per Dollar
const RAKE_BPS = 250; // 2.5%
const WORLD_BPS = 250; // 2.5%
class GameRoom extends colyseus_1.Room {
    constructor() {
        super(...arguments);
        // Server-side state (not synced)
        this.virtualWorldPoolMass = 0;
        this.activePelletMass = 0;
        // Contract tracking
        this.totalPendingClaims = 0; // To track solvency roughly
        this.contractBalance = 0; // Mock contract balance
    }
    onCreate(options) {
        this.setState(new GameState_1.GameState());
        // Setup Simulation Loop
        this.setSimulationInterval((deltaTime) => this.update(deltaTime));
        console.log("GameRoom created!");
    }
    onJoin(client, options) {
        // In production, options should contain a signed message or we verify the deposit tx
        // For now, we simulate the "Stateless Deposit" flow
        // The Client says "I deposited 10 USDC"
        // We check the chain (mocked here)
        const depositAmount = options.amount || 10; // USDC
        const wallet = options.wallet || "0x000";
        // Apply logic:
        // 1. Calculate Splits
        const rake = (depositAmount * RAKE_BPS) / 10000;
        const world = (depositAmount * WORLD_BPS) / 10000;
        const spawnUSDC = depositAmount - rake - world;
        // 2. Update World Pool
        this.virtualWorldPoolMass += world * MPD;
        this.contractBalance += depositAmount;
        // 3. Spawn Player
        const player = new GameState_1.Player();
        player.id = client.sessionId;
        player.wallet = wallet;
        const initialMass = spawnUSDC * MPD;
        const blob = new GameState_1.Blob();
        blob.id = "blob_" + client.sessionId;
        blob.mass = initialMass;
        blob.radius = Math.sqrt(initialMass) * 10; // Simple scale
        blob.x = Math.random() * this.state.width;
        blob.y = Math.random() * this.state.height;
        player.blobs.push(blob);
        this.state.players.set(client.sessionId, player);
        console.log(`Player ${wallet} joined with ${initialMass} mass`);
    }
    onLeave(client, consented) {
        // Convert mass back to USDC and "Claim"
        const player = this.state.players.get(client.sessionId);
        if (player && player.alive) {
            let totalMass = 0;
            player.blobs.forEach(b => totalMass += b.mass);
            const payoutUSDC = totalMass / MPD;
            // Update contract view
            this.contractBalance -= payoutUSDC;
            console.log(`Player left. Payout: ${payoutUSDC} USDC`);
            this.state.players.delete(client.sessionId);
        }
    }
    update(deltaTime) {
        // 1. Spawn Pellets
        this.tickPelletSpawner(deltaTime);
        // 2. Physics & Collision (Simplified)
        // TODO: Implement full physics
    }
    tickPelletSpawner(dt) {
        // Count Check
        if (this.state.pellets.size >= MAX_PELLETS)
            return;
        // Budget Check
        // We can spawn if (ActivePellets + NewPellet) < VirtualPool
        // Or simply: we spawn until the pool is 'empty' onto the map?
        // Wait, if pool is 100 mass, and we spawn 100 pellets of size 1.
        // Pool is effectively "On the map".
        // So condition is: activePelletMass < virtualWorldPoolMass
        if (this.activePelletMass >= this.virtualWorldPoolMass)
            return;
        // Spawn rate
        if (Math.random() < 0.1) { // 10% chance per tick
            const p = new GameState_1.Pellet();
            p.id = "p_" + Date.now() + Math.random();
            p.mass = PELLET_MASS;
            p.x = Math.random() * this.state.width;
            p.y = Math.random() * this.state.height;
            this.state.pellets.set(p.id, p);
            this.activePelletMass += PELLET_MASS;
        }
    }
}
exports.GameRoom = GameRoom;
//# sourceMappingURL=GameRoom.js.map