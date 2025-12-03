"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameState = exports.Pellet = exports.Player = exports.Blob = void 0;
const schema_1 = require("@colyseus/schema");
class Blob extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.x = 0;
        this.y = 0;
        this.mass = 0;
        this.radius = 0;
    }
}
exports.Blob = Blob;
__decorate([
    (0, schema_1.type)("string")
], Blob.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)("number")
], Blob.prototype, "x", void 0);
__decorate([
    (0, schema_1.type)("number")
], Blob.prototype, "y", void 0);
__decorate([
    (0, schema_1.type)("number")
], Blob.prototype, "mass", void 0);
__decorate([
    (0, schema_1.type)("number")
], Blob.prototype, "radius", void 0);
class Player extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.id = ""; // session ID
        this.wallet = ""; // Wallet Address
        this.alive = true;
        this.score = 0; // Display score
        this.blobs = new schema_1.ArraySchema();
    }
}
exports.Player = Player;
__decorate([
    (0, schema_1.type)("string")
], Player.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)("string")
], Player.prototype, "wallet", void 0);
__decorate([
    (0, schema_1.type)("boolean")
], Player.prototype, "alive", void 0);
__decorate([
    (0, schema_1.type)("number")
], Player.prototype, "score", void 0);
__decorate([
    (0, schema_1.type)([Blob])
], Player.prototype, "blobs", void 0);
class Pellet extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.x = 0;
        this.y = 0;
        this.mass = 0;
    }
}
exports.Pellet = Pellet;
__decorate([
    (0, schema_1.type)("string")
], Pellet.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)("number")
], Pellet.prototype, "x", void 0);
__decorate([
    (0, schema_1.type)("number")
], Pellet.prototype, "y", void 0);
__decorate([
    (0, schema_1.type)("number")
], Pellet.prototype, "mass", void 0);
class GameState extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.players = new schema_1.MapSchema();
        this.pellets = new schema_1.MapSchema();
        this.width = 2000;
        this.height = 2000;
    }
}
exports.GameState = GameState;
__decorate([
    (0, schema_1.type)({ map: Player })
], GameState.prototype, "players", void 0);
__decorate([
    (0, schema_1.type)({ map: Pellet })
], GameState.prototype, "pellets", void 0);
__decorate([
    (0, schema_1.type)("number")
], GameState.prototype, "width", void 0);
__decorate([
    (0, schema_1.type)("number")
], GameState.prototype, "height", void 0);
//# sourceMappingURL=GameState.js.map