import { FFA_CONFIG } from "./config.js";
import { massToRadius, movementAngleRad, playerSpeedFromMass, randIntInclusive, } from "./math.js";
import { stepMoveEngine } from "./moveEngine.js";
import { stepPlayerCellMovement } from "./movement.js";
import { buildEatList } from "./consumption.js";
export class FfaEngine {
    constructor() {
        this.bounds = {
            left: FFA_CONFIG.borderLeft,
            right: FFA_CONFIG.borderRight,
            top: FFA_CONFIG.borderTop,
            bottom: FFA_CONFIG.borderBottom,
        };
        this.nextNodeId = 1;
        this.tick = 0;
        this.players = new Map();
        this.nodes = new Map();
        // Node ID lists
        this.playerNodeIds = [];
        this.movingNodeIds = [];
        this.virusNodeIds = [];
        this.ejectedNodeIds = [];
        this.foodNodeIds = [];
    }
    newNodeId() {
        return this.nextNodeId++;
    }
    randomColor() {
        // Simple random colors; exact palette isn't important.
        const colorRGB = [0xff, 0x07, (Math.random() * 256) >> 0];
        colorRGB.sort(() => 0.5 - Math.random());
        return { r: colorRGB[0] ?? 0xff, g: colorRGB[1] ?? 0x07, b: colorRGB[2] ?? 0 };
    }
    addPlayer(params) {
        const { sessionId, wallet, displayName, spawnMass } = params;
        const existing = this.players.get(sessionId);
        if (existing)
            return existing;
        const player = {
            sessionId,
            wallet,
            displayName,
            color: this.randomColor(),
            cellIds: [],
            input: { mouseX: 0, mouseY: 0, splitPressed: false, ejectPressed: false },
            alive: true,
        };
        this.players.set(sessionId, player);
        // Spawn a single cell
        const cell = {
            id: this.newNodeId(),
            kind: "player",
            ownerSessionId: sessionId,
            x: randIntInclusive(this.bounds.left + 100, this.bounds.right - 100),
            y: randIntInclusive(this.bounds.top + 100, this.bounds.bottom - 100),
            mass: spawnMass,
            color: player.color,
            recombineSeconds: 0,
            ignoreCollisionTicks: 0,
        };
        this.nodes.set(cell.id, cell);
        this.playerNodeIds.push(cell.id);
        player.cellIds.push(cell.id);
        return player;
    }
    getPlayer(sessionId) {
        return this.players.get(sessionId);
    }
    /**
     * Find a player by wallet. O(n) over active players (fine at our scale).
     */
    findPlayerByWallet(wallet) {
        const w = wallet.toLowerCase();
        for (const p of this.players.values()) {
            if (p.wallet.toLowerCase() === w)
                return p;
        }
        return undefined;
    }
    /**
     * Update a player's sessionId (used for reconnects), and re-home all owned nodes.
     */
    rekeyPlayerSession(oldSessionId, newSessionId) {
        const p = this.players.get(oldSessionId);
        if (!p)
            return false;
        if (oldSessionId === newSessionId)
            return true;
        this.players.delete(oldSessionId);
        p.sessionId = newSessionId;
        this.players.set(newSessionId, p);
        // Update ownership on all player nodes
        for (const id of p.cellIds) {
            const n = this.nodes.get(id);
            if (n && n.kind === "player") {
                n.ownerSessionId = newSessionId;
            }
        }
        return true;
    }
    /**
     * Total mass across all owned player cells.
     */
    getPlayerTotalMass(sessionId) {
        const p = this.players.get(sessionId);
        if (!p)
            return 0;
        let total = 0;
        for (const id of p.cellIds) {
            const n = this.nodes.get(id);
            if (n && n.kind === "player")
                total += n.mass;
        }
        return total;
    }
    /**
     * Remove player + owned nodes from the world (e.g., on exit or timed-out disconnect).
     */
    removePlayer(sessionId) {
        const p = this.players.get(sessionId);
        if (!p)
            return;
        for (const id of [...p.cellIds]) {
            this.removeNode(id);
        }
        this.players.delete(sessionId);
    }
    setInput(sessionId, input) {
        const player = this.players.get(sessionId);
        if (!player)
            return;
        player.input = { ...player.input, ...input };
    }
    /**
     * Main tick step (50ms).
     */
    step() {
        const events = [];
        // Tick counters
        this.tick++;
        // Step A: move player cells + resolve eats
        // Iterate in stable insertion order.
        for (const id of [...this.playerNodeIds]) {
            const node = this.nodes.get(id);
            if (!node || node.kind !== "player")
                continue;
            const player = this.players.get(node.ownerSessionId);
            if (!player || !player.alive)
                continue;
            // Apply player input movement
            const ownedCells = [];
            for (const cid of player.cellIds) {
                const c = this.nodes.get(cid);
                if (c && c.kind === "player")
                    ownedCells.push(c);
            }
            const moved = stepPlayerCellMovement({
                cell: node,
                mouseX: player.input.mouseX,
                mouseY: player.input.mouseY,
                ownedCells,
                bounds: this.bounds,
            });
            node.x = moved.x;
            node.y = moved.y;
            // Handle split/eject edge triggers at the player level
            if (player.input.splitPressed) {
                this.splitAllEligible(player);
            }
            if (player.input.ejectPressed) {
                this.ejectAllEligible(player);
            }
            // Clear edge triggers after use
            player.input.splitPressed = false;
            player.input.ejectPressed = false;
            // Build candidates list (for now: scan all nodes; later we can spatial-index).
            const candidates = [];
            for (const other of this.nodes.values()) {
                candidates.push(other);
            }
            const preyList = buildEatList({ eater: node, candidates });
            // Consume in list order without recalculating eligibility.
            for (const { preyId } of preyList) {
                // prey might already be gone
                const prey = this.nodes.get(preyId);
                if (!prey)
                    continue;
                // Ignore if prey is same as eater or already removed
                if (prey.id === node.id)
                    continue;
                // Apply consumption effects
                this.consume(node, prey, events);
            }
        }
        // Step B: move-engine nodes (split bursts, ejected, shot viruses)
        for (let i = 0; i < this.movingNodeIds.length; i++) {
            const id = this.movingNodeIds[i];
            const node = id != null ? this.nodes.get(id) : undefined;
            if (!node)
                continue;
            const move = node.move;
            if (!move || move.ticksRemaining <= 0) {
                // No longer moving; remove from moving list
                this.movingNodeIds.splice(i, 1);
                i--;
                continue;
            }
            // Per-type auto hooks
            if (node.kind === "player") {
                if (node.ignoreCollisionTicks > 0) {
                    node.ignoreCollisionTicks--;
                }
            }
            else if (node.kind === "ejected") {
                // Try feeding viruses while moving
                const fed = this.tryFeedVirus(node, events);
                if (fed) {
                    // Node removed; also remove from moving list.
                    this.movingNodeIds.splice(i, 1);
                    i--;
                    continue;
                }
            }
            // Step movement
            const stepped = stepMoveEngine({ x: node.x, y: node.y }, move, this.bounds);
            node.x = stepped.x;
            node.y = stepped.y;
            node.move = stepped.move;
            // Move complete?
            if (stepped.move.ticksRemaining <= 0) {
                if (node.kind === "player") {
                    node.ignoreCollisionTicks = 0;
                    delete node.move;
                }
                else if (node.kind === "ejected") {
                    // Try feed on stop; if not fed, becomes stationary.
                    const fed = this.tryFeedVirus(node, events);
                    if (!fed) {
                        delete node.move;
                    }
                    else {
                        // Node removed by feeding
                    }
                }
                else if (node.kind === "virus") {
                    delete node.move;
                }
                this.movingNodeIds.splice(i, 1);
                i--;
            }
        }
        // Step C: once-per-second updates (every 20 ticks)
        if (this.tick % 20 === 0) {
            this.oneSecondUpdate(events);
        }
        return { events };
    }
    /**
     * External spawner hook: call on your desired schedule (e.g., every 20 ticks).
     * Food spawning should be gated by pelletReserveWei outside the engine.
     */
    spawnFoodBatch() {
        const currentCount = this.foodNodeIds.length;
        const toSpawn = Math.min(FFA_CONFIG.foodSpawnAmount, FFA_CONFIG.foodMaxAmount - currentCount);
        for (let i = 0; i < toSpawn; i++) {
            this.spawnRandomFood();
        }
    }
    spawnInitialFood() {
        const toSpawn = Math.min(FFA_CONFIG.foodStartAmount, FFA_CONFIG.foodMaxAmount - this.foodNodeIds.length);
        for (let i = 0; i < toSpawn; i++) {
            this.spawnRandomFood();
        }
    }
    spawnRandomFood(mass) {
        const m = typeof mass === "number"
            ? mass
            : randIntInclusive(FFA_CONFIG.foodMinMass, FFA_CONFIG.foodMinMass + FFA_CONFIG.foodMaxMass - 1);
        const pellet = {
            id: this.newNodeId(),
            kind: "food",
            x: randIntInclusive(this.bounds.left, this.bounds.right),
            y: randIntInclusive(this.bounds.top, this.bounds.bottom),
            mass: m,
            color: this.randomColor(),
        };
        this.nodes.set(pellet.id, pellet);
        this.foodNodeIds.push(pellet.id);
        return pellet;
    }
    ensureVirusMin() {
        // Spawn at most one per interval.
        if (this.virusNodeIds.length >= FFA_CONFIG.virusMinAmount)
            return;
        this.trySpawnVirus();
    }
    splitAllEligible(player) {
        // Split all current cells that can split; copy array because we'll append.
        const current = [...player.cellIds];
        for (const id of current) {
            if (player.cellIds.length >= FFA_CONFIG.playerMaxCells)
                break;
            const node = this.nodes.get(id);
            if (!node || node.kind !== "player")
                continue;
            if (node.mass < FFA_CONFIG.playerMinMassSplit)
                continue;
            const dx = player.input.mouseX - node.x;
            const dy = player.input.mouseY - node.y;
            const angle = movementAngleRad(dx, dy);
            const r = massToRadius(node.mass);
            const size = r / 2;
            const startX = node.x + size * Math.sin(angle);
            const startY = node.y + size * Math.cos(angle);
            const splitSpeed = playerSpeedFromMass(node.mass) * FFA_CONFIG.playerSplitSpeedMultiplier;
            const newMass = node.mass / 2;
            node.mass = newMass;
            const child = {
                id: this.newNodeId(),
                kind: "player",
                ownerSessionId: node.ownerSessionId,
                x: Math.trunc(startX),
                y: Math.trunc(startY),
                mass: newMass,
                color: node.color,
                recombineSeconds: this.calcRecombineSeconds(newMass),
                ignoreCollisionTicks: FFA_CONFIG.playerSmoothSplit ? FFA_CONFIG.smoothSplitNoCollideTicks : 0,
                move: {
                    angleRad: angle,
                    speed: splitSpeed,
                    ticksRemaining: 32,
                    decay: 0.85,
                },
            };
            this.nodes.set(child.id, child);
            this.playerNodeIds.push(child.id);
            player.cellIds.push(child.id);
            this.movingNodeIds.push(child.id);
        }
    }
    ejectAllEligible(player) {
        const current = [...player.cellIds];
        for (const id of current) {
            const node = this.nodes.get(id);
            if (!node || node.kind !== "player")
                continue;
            if (node.mass < FFA_CONFIG.playerMinMassEject)
                continue;
            const dx = player.input.mouseX - node.x;
            const dy = player.input.mouseY - node.y;
            let angle = movementAngleRad(dx, dy);
            const r = massToRadius(node.mass);
            const size = r + 5;
            const offset = size + FFA_CONFIG.ejectMass;
            const startX = node.x + offset * Math.sin(angle);
            const startY = node.y + offset * Math.cos(angle);
            // Apply mass loss
            node.mass -= FFA_CONFIG.ejectMassLoss;
            if (node.mass < 1)
                node.mass = 1;
            // Jitter angle
            angle += Math.random() * (FFA_CONFIG.ejectAngleJitterRad * 2) - FFA_CONFIG.ejectAngleJitterRad;
            const ejected = {
                id: this.newNodeId(),
                kind: "ejected",
                x: Math.trunc(startX),
                y: Math.trunc(startY),
                mass: FFA_CONFIG.ejectMass,
                color: node.color,
                lastAngleRad: angle,
                move: {
                    angleRad: angle,
                    speed: FFA_CONFIG.ejectSpeed,
                    ticksRemaining: FFA_CONFIG.ejectTicks,
                    decay: 0.75,
                },
            };
            this.nodes.set(ejected.id, ejected);
            this.movingNodeIds.push(ejected.id);
            this.ejectedNodeIds.push(ejected.id);
        }
    }
    consume(eater, prey, events) {
        // Ensure prey still exists
        if (!this.nodes.has(prey.id))
            return;
        switch (prey.kind) {
            case "food": {
                this.applyMassGain(eater, prey.mass);
                this.removeNode(prey.id);
                return;
            }
            case "ejected": {
                this.applyMassGain(eater, prey.mass);
                this.removeNode(prey.id);
                return;
            }
            case "player": {
                // Eat player cell
                this.applyMassGain(eater, prey.mass);
                const preyOwner = this.players.get(prey.ownerSessionId);
                this.removeNode(prey.id);
                if (preyOwner) {
                    preyOwner.cellIds = preyOwner.cellIds.filter((cid) => cid !== prey.id);
                    if (preyOwner.cellIds.length === 0) {
                        preyOwner.alive = false;
                        events.push({ type: "playerDied", sessionId: preyOwner.sessionId });
                    }
                }
                return;
            }
            case "virus": {
                // Consume virus: massless hazard — triggers pop split only.
                const owner = this.players.get(eater.ownerSessionId);
                if (owner) {
                    this.popByVirus(owner, eater);
                }
                this.removeNode(prey.id);
                return;
            }
        }
    }
    applyMassGain(cell, gained) {
        const player = this.players.get(cell.ownerSessionId);
        if (!player) {
            cell.mass = Math.min(cell.mass + gained, FFA_CONFIG.playerMaxMass);
            return;
        }
        // Max-mass overflow behavior (auto split on overflow if there is a free slot)
        if (cell.mass + gained > FFA_CONFIG.playerMaxMass &&
            player.cellIds.length < FFA_CONFIG.playerMaxCells) {
            const newMass = (cell.mass + gained) / 2;
            cell.mass = newMass;
            const child = {
                id: this.newNodeId(),
                kind: "player",
                ownerSessionId: cell.ownerSessionId,
                x: cell.x,
                y: cell.y,
                mass: newMass,
                color: cell.color,
                recombineSeconds: this.calcRecombineSeconds(newMass),
                ignoreCollisionTicks: 15,
                move: {
                    angleRad: 0,
                    speed: 150 * FFA_CONFIG.playerPopSplitSpeedMultiplier,
                    ticksRemaining: 15,
                    decay: 0.75,
                },
            };
            this.nodes.set(child.id, child);
            this.playerNodeIds.push(child.id);
            player.cellIds.push(child.id);
            this.movingNodeIds.push(child.id);
            return;
        }
        cell.mass = Math.min(cell.mass + gained, FFA_CONFIG.playerMaxMass);
    }
    popByVirus(player, consumer) {
        const maxSplits = Math.floor(consumer.mass / 16) - 1;
        const availableSlots = FFA_CONFIG.playerMaxCells - player.cellIds.length;
        let numSplits = Math.min(availableSlots, maxSplits);
        let splitMass = Math.min(consumer.mass / (numSplits + 1), 36);
        if (numSplits <= 0) {
            consumer.recombineSeconds = this.calcRecombineSeconds(consumer.mass);
            return;
        }
        // Decide big splits
        let bigSplits = 0;
        let endMass = consumer.mass - numSplits * splitMass;
        if (endMass > 300 && numSplits > 0) {
            bigSplits++;
            numSplits--;
        }
        if (endMass > 1200 && numSplits > 0) {
            bigSplits++;
            numSplits--;
        }
        if (endMass > 3000 && numSplits > 0) {
            bigSplits++;
            numSplits--;
        }
        // Small splits (evenly distributed angles)
        let angle = 0;
        for (let k = 0; k < numSplits; k++) {
            angle += 6 / numSplits;
            this.spawnVirusedCell(player, consumer, angle, splitMass, 150);
            consumer.mass -= splitMass;
        }
        // Big splits (random angles, mass quartering)
        for (let k = 0; k < bigSplits; k++) {
            angle = Math.random() * 6.28;
            splitMass = consumer.mass / 4;
            this.spawnVirusedCell(player, consumer, angle, splitMass, 20);
            consumer.mass -= splitMass;
        }
        consumer.recombineSeconds = this.calcRecombineSeconds(consumer.mass);
    }
    spawnVirusedCell(player, parent, angleRad, mass, speed) {
        const child = {
            id: this.newNodeId(),
            kind: "player",
            ownerSessionId: parent.ownerSessionId,
            x: parent.x,
            y: parent.y,
            mass,
            color: parent.color,
            recombineSeconds: this.calcRecombineSeconds(mass),
            ignoreCollisionTicks: 15,
            move: {
                angleRad,
                speed: speed * FFA_CONFIG.playerPopSplitSpeedMultiplier,
                ticksRemaining: 15,
                decay: 0.75,
            },
        };
        this.nodes.set(child.id, child);
        this.playerNodeIds.push(child.id);
        player.cellIds.push(child.id);
        this.movingNodeIds.push(child.id);
    }
    calcRecombineSeconds(mass) {
        // base + floor(0.02 * mass)
        return FFA_CONFIG.playerRecombineTimeSec + Math.trunc(0.02 * mass);
    }
    removeNode(id) {
        const node = this.nodes.get(id);
        if (!node)
            return;
        this.nodes.delete(id);
        // Remove from lists (O(n), ok for now)
        this.removeFromList(this.playerNodeIds, id);
        this.removeFromList(this.movingNodeIds, id);
        this.removeFromList(this.virusNodeIds, id);
        this.removeFromList(this.ejectedNodeIds, id);
        this.removeFromList(this.foodNodeIds, id);
    }
    removeFromList(list, id) {
        const idx = list.indexOf(id);
        if (idx !== -1)
            list.splice(idx, 1);
    }
    // (food/virus spawning is driven externally)
    trySpawnVirus() {
        const pos = {
            x: randIntInclusive(this.bounds.left, this.bounds.right),
            y: randIntInclusive(this.bounds.top, this.bounds.bottom),
        };
        const virusSquareSize = Math.trunc(FFA_CONFIG.virusSizeMass * 110);
        // Avoid spawning inside large player cells
        for (const id of this.playerNodeIds) {
            const node = this.nodes.get(id);
            if (!node || node.kind !== "player")
                continue;
            if (node.mass < FFA_CONFIG.virusSizeMass)
                continue;
            const squareR = Math.trunc(100 * node.mass);
            const dx = node.x - pos.x;
            const dy = node.y - pos.y;
            if (dx * dx + dy * dy + virusSquareSize <= squareR)
                return;
        }
        // Avoid spawning inside other viruses
        for (const id of this.virusNodeIds) {
            const node = this.nodes.get(id);
            if (!node || node.kind !== "virus")
                continue;
            const squareR = Math.trunc(100 * node.sizeMass);
            const dx = node.x - pos.x;
            const dy = node.y - pos.y;
            if (dx * dx + dy * dy + virusSquareSize <= squareR)
                return;
        }
        const virus = {
            id: this.newNodeId(),
            kind: "virus",
            x: pos.x,
            y: pos.y,
            sizeMass: FFA_CONFIG.virusSizeMass,
            feedCount: 0,
            lastFeedAngleRad: 0,
        };
        this.nodes.set(virus.id, virus);
        this.virusNodeIds.push(virus.id);
    }
    tryFeedVirus(ejected, events) {
        // If virus count reached max, ejected passes through
        if (this.virusNodeIds.length >= FFA_CONFIG.virusMaxAmount)
            return false;
        // Find nearby virus (AABB radius 100 check)
        const r = 100;
        const topY = ejected.y - r;
        const bottomY = ejected.y + r;
        const leftX = ejected.x - r;
        const rightX = ejected.x + r;
        let target = null;
        for (const id of this.virusNodeIds) {
            const node = this.nodes.get(id);
            if (!node || node.kind !== "virus")
                continue;
            if (node.y > bottomY)
                continue;
            if (node.y < topY)
                continue;
            if (node.x > rightX)
                continue;
            if (node.x < leftX)
                continue;
            target = node;
            break;
        }
        if (!target)
            return false;
        // Feed count and direction
        target.lastFeedAngleRad = ejected.lastAngleRad;
        target.feedCount += 1;
        // Remove ejected node from world
        this.removeNode(ejected.id);
        events.push({ type: "ejectedFedVirus", mass: ejected.mass });
        // Shoot a virus when feed threshold reached
        if (target.feedCount >= FFA_CONFIG.virusFeedAmount) {
            target.feedCount = 0;
            this.shootVirus(target);
        }
        return true;
    }
    shootVirus(parent) {
        const v = {
            id: this.newNodeId(),
            kind: "virus",
            x: parent.x,
            y: parent.y,
            sizeMass: FFA_CONFIG.virusSizeMass,
            feedCount: 0,
            lastFeedAngleRad: 0,
            move: {
                angleRad: parent.lastFeedAngleRad,
                speed: FFA_CONFIG.virusShotSpeed,
                ticksRemaining: FFA_CONFIG.virusShotTicks,
                decay: 0.75,
            },
        };
        this.nodes.set(v.id, v);
        this.virusNodeIds.push(v.id);
        this.movingNodeIds.push(v.id);
    }
    oneSecondUpdate(events) {
        // Update recombine timers and mass decay for all player cells.
        for (const id of [...this.playerNodeIds]) {
            const node = this.nodes.get(id);
            if (!node || node.kind !== "player")
                continue;
            if (node.recombineSeconds > 0)
                node.recombineSeconds--;
            // Mass decay
            if (node.mass >= FFA_CONFIG.playerMinMassDecay) {
                const before = node.mass;
                const decayFactor = 1 - FFA_CONFIG.playerMassDecayRatePerSec;
                node.mass = node.mass * decayFactor;
                const decayed = before - node.mass;
                if (decayed > 0) {
                    events.push({ type: "massDecayed", mass: decayed });
                }
            }
        }
    }
}
