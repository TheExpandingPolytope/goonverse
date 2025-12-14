import config from "@colyseus/tools";
import { RedisPresence } from "@colyseus/redis-presence";
import { RedisDriver } from "@colyseus/redis-driver";
import { monitor } from "@colyseus/monitor";
import { matchMaker } from "colyseus";
import express from "express";
import { config as envConfig } from "./config.js";
import { GameRoom } from "./rooms/GameRoom.js";
import { verifyPrivyToken, getPrivyUser, getPrimaryWallet } from "./auth/privy.js";
import { getPlayerDeposits } from "./services/ponder.js";
import { isDepositUsed } from "./services/depositTracker.js";
import { startBalanceSync } from "./services/balance.js";
// Parse Redis URL into options object so we can disable ready check.
// Ready check sends INFO command which fails if connection is already in subscriber mode.
function parseRedisUrl(url) {
    const parsed = new URL(url);
    return {
        host: parsed.hostname || "localhost",
        port: parseInt(parsed.port, 10) || 6379,
        password: parsed.password || undefined,
        db: parsed.pathname ? parseInt(parsed.pathname.slice(1), 10) || 0 : 0,
        // Critical: disable ready check to prevent INFO command in subscriber mode
        enableReadyCheck: false,
    };
}
const redisOptions = parseRedisUrl(envConfig.redisUri);
export default config({
    options: {
        presence: new RedisPresence(redisOptions),
        driver: new RedisDriver(redisOptions),
    },
    initializeGameServer: (gameServer) => {
        // Define the main game room
        gameServer.define("game", GameRoom);
        // Proactively create a room for this serverId so /rooms isn't empty on cold start.
        // This uses the configured SERVER_ID; if the room already exists, creation will throw, so we ignore that error.
        (async () => {
            try {
                await matchMaker.createRoom("game", { serverId: envConfig.serverId });
                console.log(`[bootstrap] Created initial room for serverId ${envConfig.serverId}`);
            }
            catch (error) {
                // If room already exists or creation fails, log and continue.
                console.warn(`[bootstrap] Skipped creating initial room: ${error.message}`);
            }
        })();
    },
    initializeExpress: (app) => {
        // Parse JSON bodies
        app.use(express.json({ limit: "100kb" }));
        // Colyseus monitor (dev-only): view rooms and inspect live room state.
        if (envConfig.nodeEnv !== "production") {
            app.use("/monitor", monitor());
        }
        // Health check endpoint
        app.get("/healthz", (_req, res) => {
            res.json({ status: "ok", timestamp: Date.now() });
        });
        // Lightweight ping endpoint for client RTT measurement
        // Returns minimal payload for accurate latency timing
        app.get("/ping", (_req, res) => {
            res.json({ ts: Date.now() });
        });
        // Room listing endpoint - returns ALL rooms across ALL machines
        // Uses RedisDriver so matchMaker.query() sees rooms from all processes
        app.get("/rooms", async (req, res) => {
            try {
                const rooms = await matchMaker.query({ name: "game" });
                // Derive HTTP origin (behind proxies if applicable)
                const forwardedProto = req.headers["x-forwarded-proto"] || undefined;
                const forwardedHost = req.headers["x-forwarded-host"] || undefined;
                const protocol = forwardedProto || req.protocol;
                const host = forwardedHost || req.headers.host || "";
                const httpOrigin = host ? `${protocol}://${host}` : "";
                // Derive WebSocket endpoint from HTTP origin
                const wsEndpoint = httpOrigin.startsWith("https://")
                    ? httpOrigin.replace("https://", "wss://")
                    : httpOrigin.startsWith("http://")
                        ? httpOrigin.replace("http://", "ws://")
                        : "";
                res.json({
                    rooms,
                    count: rooms.length,
                    timestamp: Date.now(),
                    wsEndpoint,
                });
            }
            catch (error) {
                console.error("Error fetching rooms:", error);
                res.status(500).json({ error: "Failed to fetch rooms" });
            }
        });
        // Current balance telemetry for operators
        app.get("/balances/current", async (_req, res) => {
            try {
                const rooms = await matchMaker.query({ name: "game" });
                const balances = rooms.map((room) => ({
                    roomId: room.roomId,
                    serverId: room.metadata?.serverId,
                    worldBalance: room.metadata?.worldBalance ?? "0",
                    massPerEth: room.metadata?.massPerEth,
                    buyInAmount: room.metadata?.buyInAmount,
                    clients: room.clients,
                    maxClients: room.maxClients,
                }));
                res.json({
                    balances,
                    count: balances.length,
                    timestamp: Date.now(),
                });
            }
            catch (error) {
                console.error("Error fetching balances:", error);
                res.status(500).json({ error: "Failed to fetch balances" });
            }
        });
        // Pending exit tickets endpoint (requires Privy auth)
        app.get("/sessions/pending-exits", async (req, res) => {
            try {
                const authHeader = req.headers.authorization;
                if (!authHeader?.startsWith("Bearer ")) {
                    res.status(401).json({ error: "Missing authorization header" });
                    return;
                }
                const token = authHeader.slice(7);
                const claims = await verifyPrivyToken(token);
                if (!claims) {
                    res.status(401).json({ error: "Invalid token" });
                    return;
                }
                // TODO: Fetch pending exit tickets from Redis for this user's wallet
                // For now, return empty array
                res.json({ tickets: [] });
            }
            catch (error) {
                console.error("Error fetching pending exits:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });
        /**
         * Join Eligibility Endpoint
         *
         * Checks if a wallet can join a server by finding an unused deposit.
         * Returns the depositId to use for joining, or indicates deposit is required.
         *
         * Query params:
         * - serverId: The server ID (bytes32 hex string)
         * - wallet: The player's wallet address (optional if using Privy auth)
         *
         * Requires Privy auth token in Authorization header.
         */
        app.get("/join-eligibility", async (req, res) => {
            try {
                // Verify Privy token
                const authHeader = req.headers.authorization;
                if (!authHeader?.startsWith("Bearer ")) {
                    res.status(401).json({ error: "Missing authorization header" });
                    return;
                }
                const token = authHeader.slice(7);
                const claims = await verifyPrivyToken(token);
                if (!claims) {
                    res.status(401).json({ error: "Invalid token" });
                    return;
                }
                // Get wallet from Privy user
                const user = await getPrivyUser(claims.userId);
                const wallet = getPrimaryWallet(user);
                if (!wallet) {
                    res.status(400).json({ error: "No wallet linked to account" });
                    return;
                }
                // Get serverId from query params
                const serverId = req.query.serverId;
                if (!serverId) {
                    res.status(400).json({ error: "Missing serverId parameter" });
                    return;
                }
                const normalizedWallet = wallet.toLowerCase();
                // 1. RECONNECT PATH: Check if any active GameRoom already has a living entity for this wallet.
                try {
                    const rooms = await matchMaker.query({ name: "game", metadata: { serverId } });
                    for (const room of rooms) {
                        try {
                            const hasEntity = (await matchMaker.remoteRoomCall(room.roomId, "hasActiveEntity", [normalizedWallet]));
                            if (hasEntity) {
                                console.log(`Join eligibility: found active entity for ${normalizedWallet} in room ${room.roomId} on server ${serverId}`);
                                res.json({
                                    canJoin: true,
                                    action: "reconnect",
                                    wallet,
                                    serverId,
                                });
                                return;
                            }
                        }
                        catch (error) {
                            console.warn(`Join eligibility: hasActiveEntity remote call failed for room ${room.roomId}:`, error);
                        }
                    }
                }
                catch (error) {
                    console.error("Join eligibility: error while checking active entities:", error);
                }
                // 2. SPAWN PATH: No active entity; query indexer for player's deposits on this server
                console.log("Getting player deposits for", wallet, "on server", serverId);
                const deposits = await getPlayerDeposits(serverId, normalizedWallet);
                if (deposits.length === 0) {
                    console.log("No deposits found for", wallet, "on server", serverId);
                    res.json({
                        canJoin: false,
                        reason: "deposit_required",
                        wallet,
                        serverId,
                    });
                    return;
                }
                // Find first unused deposit
                for (const deposit of deposits) {
                    const used = await isDepositUsed(serverId, deposit.id);
                    if (!used) {
                        console.log("Found unused deposit", deposit.id, "for", wallet, "on server", serverId);
                        res.json({
                            canJoin: true,
                            action: "spawn",
                            depositId: deposit.id,
                            spawnAmount: deposit.spawnAmount.toString(),
                            wallet,
                            serverId,
                        });
                        return;
                    }
                }
                console.log("All deposits are used for", wallet, "on server", serverId);
                // All deposits are used
                res.json({
                    canJoin: false,
                    reason: "deposit_required",
                    wallet,
                    serverId,
                    depositsChecked: deposits.length,
                });
            }
            catch (error) {
                console.error("Error checking join eligibility:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });
    },
    beforeListen: () => {
        // Start background sync to keep pelletReserveWei (worldAmount) and observed bankroll
        // up-to-date for this serverId, even when deposits occur while no one is in-game.
        startBalanceSync({ serverId: envConfig.serverId });
        console.log(`Game server starting on port ${envConfig.port}`);
        console.log(`Server ID: ${envConfig.serverId}`);
        console.log(`Ponder URL: ${envConfig.ponderUrl}`);
    },
});
