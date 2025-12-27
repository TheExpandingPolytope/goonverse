import config from "@colyseus/tools";
import { RedisPresence } from "@colyseus/redis-presence";
import { RedisDriver } from "@colyseus/redis-driver";
import { monitor } from "@colyseus/monitor";
import { matchMaker } from "colyseus";
import express from "express";
import { config as envConfig } from "./config.js";
import { GameRoom } from "./rooms/GameRoom.js";
import { verifyPrivyToken, getPrivyUser, getPrimaryWallet } from "./auth/privy.js";
import { getServer, serverIdToBytes32 } from "./services/ponder.js";
import { getAccounts } from "./services/accounts.js";

// Parse Redis URL into options object so we can disable ready check.
// Ready check sends INFO command which fails if connection is already in subscriber mode.
function parseRedisUrl(url: string) {
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
      } catch (error) {
        // If room already exists or creation fails, log and continue.
        console.warn(`[bootstrap] Skipped creating initial room: ${(error as Error).message}`);
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
      // Ensure intermediaries don't cache (we time RTT).
      res.json({ ts: Date.now() });
      console.log("Ping response:", { ts: Date.now() });
    });

    // Room listing endpoint - returns ALL rooms across ALL machines
    // Uses RedisDriver so matchMaker.query() sees rooms from all processes
    app.get("/rooms", async (req, res) => {
      try {
        const rooms = await matchMaker.query({ name: "game" });

        // Derive HTTP origin (behind proxies if applicable)
        const forwardedProto = (req.headers["x-forwarded-proto"] as string) || undefined;
        const forwardedHost = (req.headers["x-forwarded-host"] as string) || undefined;
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
      } catch (error) {
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
      } catch (error) {
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
      } catch (error) {
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
        const serverId = req.query.serverId as string;
        if (!serverId) {
          res.status(400).json({ error: "Missing serverId parameter" });
          return;
        }

        const normalizedWallet = wallet.toLowerCase() as `0x${string}`;
        const targetServerIdB32 = serverIdToBytes32(serverId).toLowerCase();

        // 1. RECONNECT PATH: Check if any active GameRoom already has a living entity for this wallet.
        try {
          const allRooms = await matchMaker.query({ name: "game" });
          const roomsMatchingServer = allRooms.filter((room) => {
            const sid = room.metadata?.serverId;
            if (typeof sid !== "string" || sid.length === 0) return false;
            return serverIdToBytes32(sid).toLowerCase() === targetServerIdB32;
          });

          // If metadata filtering is incomplete for any reason, fall back to scanning all rooms.
          const rooms = roomsMatchingServer.length > 0 ? roomsMatchingServer : allRooms;

          for (const room of rooms) {
            try {
              const hasEntity = (await matchMaker.remoteRoomCall(
                room.roomId,
                "hasActiveEntity",
                [normalizedWallet],
              )) as boolean;

              if (hasEntity) {
                console.log(
                  `Join eligibility: found active entity for ${normalizedWallet} in room ${room.roomId} on server ${serverId}`,
                );
                res.json({
                  canJoin: true,
                  action: "reconnect",
                  roomId: room.roomId,
                  wallet,
                  serverId,
                });
                return;
              }
            } catch (error) {
              console.warn(
                `Join eligibility: hasActiveEntity remote call failed for room ${room.roomId}:`,
                error,
              );
            }
          }
        } catch (error) {
          console.error("Join eligibility: error while checking active entities:", error);
        }

        // 2. SPAWN PATH: No active entity; check Redis hot-ledger user balance.
        const serverCfg = await getServer(serverId);
        if (!serverCfg) {
          res.status(400).json({ error: "Unknown serverId" });
          return;
        }

        const buyInWei = BigInt(serverCfg.buyInAmount ?? "0");
        const rakeBps = BigInt(serverCfg.rakeShareBps ?? 0);
        const worldBps = BigInt(serverCfg.worldShareBps ?? 0);
        const spawnCostWei = buyInWei - (buyInWei * rakeBps) / 10_000n - (buyInWei * worldBps) / 10_000n;

        const accounts = getAccounts();
        const bal = await accounts.getBalance(`user:${normalizedWallet}`);

        if (bal >= spawnCostWei) {
          res.json({
            canJoin: true,
            action: "spawn",
            spawnAmount: spawnCostWei.toString(),
            wallet,
            serverId,
          });
          return;
        }

        res.json({
          canJoin: false,
          reason: "deposit_required",
          wallet,
          serverId,
          requiredSpawnAmount: spawnCostWei.toString(),
          balance: bal.toString(),
        });
      } catch (error) {
        console.error("Error checking join eligibility:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });
  },

  beforeListen: () => {
    console.log(`Game server starting on port ${envConfig.port}`);
    console.log(`Server ID: ${envConfig.serverId}`);
    console.log(`Ponder URL: ${envConfig.ponderUrl}`);

    // Periodically sweep expired exit reservations (every 60s)
    const EXIT_SWEEP_INTERVAL_MS = 60_000;
    setInterval(async () => {
      try {
        const swept = await getAccounts().sweepExpiredReservations(50);
        if (swept > 0) {
          console.log(`[exit-sweeper] Reclaimed ${swept} expired exit reservations`);
        }
      } catch (error) {
        console.error("[exit-sweeper] Error sweeping expired reservations:", error);
      }
    }, EXIT_SWEEP_INTERVAL_MS);
  },
});

