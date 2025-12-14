var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Schema, ArraySchema, MapSchema, type } from "@colyseus/schema";
/**
 * Pellet - static food items on the map
 */
export class Pellet extends Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.x = 0;
        this.y = 0;
        this.mass = 1;
        this.radius = 10;
        this.color = 0; // Color index for variety
    }
}
__decorate([
    type("string"),
    __metadata("design:type", String)
], Pellet.prototype, "id", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Pellet.prototype, "x", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Pellet.prototype, "y", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Pellet.prototype, "mass", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Pellet.prototype, "radius", void 0);
__decorate([
    type("uint8"),
    __metadata("design:type", Number)
], Pellet.prototype, "color", void 0);
/**
 * Ejected Mass - moving mass projectiles that can be eaten
 */
export class EjectedMass extends Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.owner = ""; // Original owner's sessionId (can't eat own eject briefly)
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.mass = 16;
        this.radius = 0;
        this.createdAt = 0; // Timestamp for ownership timeout
    }
}
__decorate([
    type("string"),
    __metadata("design:type", String)
], EjectedMass.prototype, "id", void 0);
__decorate([
    type("string"),
    __metadata("design:type", String)
], EjectedMass.prototype, "owner", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], EjectedMass.prototype, "x", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], EjectedMass.prototype, "y", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], EjectedMass.prototype, "vx", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], EjectedMass.prototype, "vy", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], EjectedMass.prototype, "mass", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], EjectedMass.prototype, "radius", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], EjectedMass.prototype, "createdAt", void 0);
/**
 * Player blob state - synchronized to all clients
 *
 * Each player can have multiple blobs after splitting.
 * Blobs have velocity for physics-based movement.
 */
export class Blob extends Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.owner = ""; // Player's sessionId
        // Position
        this.x = 0;
        this.y = 0;
        // Velocity (for physics)
        this.vx = 0;
        this.vy = 0;
        // Target position (where player is aiming)
        this.targetX = 0;
        this.targetY = 0;
        // Size
        this.mass = 0;
        this.radius = 0;
        // Split/Merge tracking
        this.timeSinceSplit = 0; // ms since last split
        this.canMerge = false; // true when recombine timer expired
        // Exit state
        this.isExiting = false;
        this.exitProgress = 0; // 0-1, progress through exit hold
        this.originalRadius = 0; // Radius before exit shrink started
        // Cooldowns (not synced to client, server-side only tracking)
        this.lastSplitTime = 0;
        this.lastEjectTime = 0;
    }
}
__decorate([
    type("string"),
    __metadata("design:type", String)
], Blob.prototype, "id", void 0);
__decorate([
    type("string"),
    __metadata("design:type", String)
], Blob.prototype, "owner", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Blob.prototype, "x", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Blob.prototype, "y", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Blob.prototype, "vx", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Blob.prototype, "vy", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Blob.prototype, "targetX", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Blob.prototype, "targetY", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Blob.prototype, "mass", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Blob.prototype, "radius", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Blob.prototype, "timeSinceSplit", void 0);
__decorate([
    type("boolean"),
    __metadata("design:type", Boolean)
], Blob.prototype, "canMerge", void 0);
__decorate([
    type("boolean"),
    __metadata("design:type", Boolean)
], Blob.prototype, "isExiting", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Blob.prototype, "exitProgress", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Blob.prototype, "originalRadius", void 0);
/**
 * Player state - synchronized to all clients
 *
 * A player can control multiple blobs after splitting.
 */
export class Player extends Schema {
    constructor() {
        super(...arguments);
        this.sessionId = "";
        this.wallet = "";
        this.displayName = "";
        this.spawnMass = 0;
        this.currentMass = 0; // Sum of all blob masses
        this.isAlive = true;
        this.isExiting = false;
        this.exitStartedAt = 0;
        // Multiple blobs (after splitting)
        this.blobs = new ArraySchema();
        // Color for all player's blobs
        this.color = 0;
    }
}
__decorate([
    type("string"),
    __metadata("design:type", String)
], Player.prototype, "sessionId", void 0);
__decorate([
    type("string"),
    __metadata("design:type", String)
], Player.prototype, "wallet", void 0);
__decorate([
    type("string"),
    __metadata("design:type", String)
], Player.prototype, "displayName", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Player.prototype, "spawnMass", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Player.prototype, "currentMass", void 0);
__decorate([
    type("boolean"),
    __metadata("design:type", Boolean)
], Player.prototype, "isAlive", void 0);
__decorate([
    type("boolean"),
    __metadata("design:type", Boolean)
], Player.prototype, "isExiting", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], Player.prototype, "exitStartedAt", void 0);
__decorate([
    type([Blob]),
    __metadata("design:type", Object)
], Player.prototype, "blobs", void 0);
__decorate([
    type("uint8"),
    __metadata("design:type", Number)
], Player.prototype, "color", void 0);
/**
 * Main game state - the root schema synchronized to all clients
 */
export class GameState extends Schema {
    constructor() {
        super(...arguments);
        this.serverId = "";
        this.tickRate = 20;
        this.exitHoldMs = 3000;
        this.massPerEth = 100;
        // Players
        this.players = new MapSchema();
        // Pellets (static food)
        this.pellets = new MapSchema();
        // Ejected mass (moving food)
        this.ejectedMass = new MapSchema();
        // World bounds
        this.worldWidth = 4000;
        this.worldHeight = 4000;
        // World Balance (token balance for spawning pellets)
        this.worldBalance = "0"; // Stored as string to handle BigInt safety
    }
}
__decorate([
    type("string"),
    __metadata("design:type", String)
], GameState.prototype, "serverId", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], GameState.prototype, "tickRate", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], GameState.prototype, "exitHoldMs", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], GameState.prototype, "massPerEth", void 0);
__decorate([
    type({ map: Player }),
    __metadata("design:type", Object)
], GameState.prototype, "players", void 0);
__decorate([
    type({ map: Pellet }),
    __metadata("design:type", Object)
], GameState.prototype, "pellets", void 0);
__decorate([
    type({ map: EjectedMass }),
    __metadata("design:type", Object)
], GameState.prototype, "ejectedMass", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], GameState.prototype, "worldWidth", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Number)
], GameState.prototype, "worldHeight", void 0);
__decorate([
    type("string"),
    __metadata("design:type", String)
], GameState.prototype, "worldBalance", void 0);
