import config from "@colyseus/tools";
import { RedisPresence } from "@colyseus/redis-presence";
import express from "express";
import { config as envConfig } from "./config.js";
import { GameRoom } from "./rooms/GameRoom.js";
import { verifyPrivyToken } from "./auth/privy.js";

export default config({
  options: {
    presence: new RedisPresence(envConfig.redisUri),
  },

  initializeGameServer: (gameServer) => {
    // Define the main game room
    gameServer.define("game", GameRoom);
  },

  initializeExpress: (app) => {
    // Parse JSON bodies
    app.use(express.json({ limit: "100kb" }));

    // Health check endpoint
    app.get("/healthz", (_req, res) => {
      res.json({ status: "ok", timestamp: Date.now() });
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
  },

  beforeListen: () => {
    console.log(`Game server starting on port ${envConfig.port}`);
    console.log(`Server ID: ${envConfig.serverId}`);
    console.log(`Ponder URL: ${envConfig.ponderUrl}`);
  },
});

