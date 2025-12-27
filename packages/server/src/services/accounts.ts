import Redis from "ioredis";
import { config } from "../config.js";
import { AccountManager } from "@goonverse/accounts";

let redisClient: Redis | null = null;
let accounts: AccountManager | null = null;

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redisUri, {
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
    });
    redisClient.on("error", (err) => console.error("[accounts] Redis error:", err));
  }
  return redisClient;
}

export function getAccounts(): AccountManager {
  if (!accounts) {
    accounts = new AccountManager(getRedis(), config.serverId.toLowerCase());
  }
  return accounts;
}


