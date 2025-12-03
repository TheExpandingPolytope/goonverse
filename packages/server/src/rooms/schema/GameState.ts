import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Blob extends Schema {
    @type("string") id: string = "";
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("number") mass: number = 0;
    @type("number") radius: number = 0;
}

export class Player extends Schema {
    @type("string") id: string = ""; // session ID
    @type("string") wallet: string = ""; // Wallet Address
    @type("boolean") alive: boolean = true;
    @type("number") score: number = 0; // Display score
    
    @type([Blob]) blobs = new ArraySchema<Blob>();
}

export class Pellet extends Schema {
    @type("string") id: string = "";
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("number") mass: number = 0;
}

export class GameState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
    @type({ map: Pellet }) pellets = new MapSchema<Pellet>();
    
    @type("number") width: number = 2000;
    @type("number") height: number = 2000;
}

