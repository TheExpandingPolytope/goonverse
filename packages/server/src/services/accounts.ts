import Redis from "ioredis";
import { config } from "../config.js";
import { AccountManager, type SigningConfig } from "@goonverse/accounts";
import { serverIdToBytes32 } from "./ponder.js";

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

/**
 * Get the global AccountManager instance.
 * All operations now take serverId as the first argument.
 */
export function getAccounts(): AccountManager {
  if (!accounts) {
    accounts = new AccountManager(getRedis());
  }
  return accounts;
}

/**
 * Get the normalized serverId (bytes32 format).
 */
export function getServerId(): string {
  return serverIdToBytes32(config.serverId).toLowerCase();
}

/**
 * Get the signing config for withdraw operations.
 */
export function getSigningConfig(): SigningConfig {
  return {
    controllerPrivateKey: config.controllerPrivateKey,
    worldContractAddress: config.worldContractAddress,
    exitTicketTtlSeconds: config.exitTicketTtlSeconds,
  };
}
