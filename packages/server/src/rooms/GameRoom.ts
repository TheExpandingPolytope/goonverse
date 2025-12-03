import { Room, Client } from "colyseus";
import { GameState, Player, Blob, Pellet } from "./schema/GameState";

const MAX_PELLETS = 500;
const PELLET_MASS = 1;
const MPD = 100; // Mass Per Dollar
const RAKE_BPS = 250; // 2.5%
const WORLD_BPS = 250; // 2.5%

export class GameRoom extends Room<GameState> {
    // Server-side state (not synced)
    virtualWorldPoolMass: number = 0; 
    activePelletMass: number = 0;
    
    // Contract tracking
    totalPendingClaims: number = 0; // To track solvency roughly
    contractBalance: number = 0;    // Mock contract balance

    onCreate(options: any) {
        this.setState(new GameState());

        // Setup Simulation Loop
        this.setSimulationInterval((deltaTime) => this.update(deltaTime));

        console.log("GameRoom created!");
    }

    onJoin(client: Client, options: any) {
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
        const player = new Player();
        player.id = client.sessionId;
        player.wallet = wallet;
        
        const initialMass = spawnUSDC * MPD;
        const blob = new Blob();
        blob.id = "blob_" + client.sessionId;
        blob.mass = initialMass;
        blob.radius = Math.sqrt(initialMass) * 10; // Simple scale
        blob.x = Math.random() * this.state.width;
        blob.y = Math.random() * this.state.height;

        player.blobs.push(blob);
        this.state.players.set(client.sessionId, player);
        
        console.log(`Player ${wallet} joined with ${initialMass} mass`);
    }

    onLeave(client: Client, consented: boolean) {
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

    update(deltaTime: number) {
        if (this.roundEnded) return;

        this.elapsedTime += deltaTime;
        if (this.elapsedTime >= this.roundDuration) {
            this.endRound();
            return;
        }

        // 1. Spawn Pellets
        this.tickPelletSpawner(deltaTime);
        
        // 2. Physics & Collision (Simplified)
        // TODO: Implement full physics
    }

    async endRound() {
        this.roundEnded = true;
        console.log("Round Ended! Calculating results...");

        const players: string[] = [];
        const finalMasses: number[] = [];

        this.state.players.forEach((player) => {
            if (player.alive) {
                let totalMass = 0;
                player.blobs.forEach(b => totalMass += b.mass);
                
                players.push(player.wallet);
                finalMasses.push(totalMass);
            }
        });

        // Mock Contract Call: endRound(roundId, players, finalMasses)
        // const tx = await contract.endRound(ethers.id("round1"), players, finalMasses);
        
        console.log(`Submitting results for ${players.length} players.`);
        
        // Calculate payouts locally for logging
        let totalPayout = 0;
        finalMasses.forEach(m => {
            const payout = (m * 1_000_000) / MPD; // Using high precision math
            totalPayout += payout;
        });
        
        console.log(`Total Payout: ${totalPayout / 1_000_000} USDC`);
        
        // Disconnect all clients
        this.broadcast("round_ended", { totalPayout });
        this.disconnect();
    }

    tickPelletSpawner(dt: number) {
        // Count Check
        if (this.state.pellets.size >= MAX_PELLETS) return;

        // Budget Check
        // We can spawn if (ActivePellets + NewPellet) < VirtualPool
        // Or simply: we spawn until the pool is 'empty' onto the map?
        // Wait, if pool is 100 mass, and we spawn 100 pellets of size 1.
        // Pool is effectively "On the map".
        // So condition is: activePelletMass < virtualWorldPoolMass
        
        if (this.activePelletMass >= this.virtualWorldPoolMass) return;

        // Spawn rate
        if (Math.random() < 0.1) { // 10% chance per tick
            const p = new Pellet();
            p.id = "p_" + Date.now() + Math.random();
            p.mass = PELLET_MASS;
            p.x = Math.random() * this.state.width;
            p.y = Math.random() * this.state.height;
            
            this.state.pellets.set(p.id, p);
            this.activePelletMass += PELLET_MASS;
        }
    }
}

