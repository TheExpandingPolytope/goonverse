import Redis from "ioredis";
import { config } from "../config.js";
import { AccountManager, type SigningConfig } from "@goonverse/accounts";
import { serverIdToBytes32 } from "./ponder.js";

const redis = new Redis(config.redisUri, {
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
});
redis.on("error", (err) => console.error("[ledger] Redis error:", err));

/** Global account ledger. All operations take serverId as first argument. */
export const ledger = new AccountManager(redis);

/** Normalized serverId (bytes32 format). */
export const serverId = serverIdToBytes32(config.serverId).toLowerCase();

/** Signing config for withdraw operations. */
export const signingConfig: SigningConfig = {
  controllerPrivateKey: config.controllerPrivateKey,
  worldContractAddress: config.worldContractAddress,
  exitTicketTtlSeconds: config.exitTicketTtlSeconds,
};
