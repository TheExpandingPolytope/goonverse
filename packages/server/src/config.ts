/**
 * Environment configuration with validation
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

const CHAIN_ID_ANVIL = 31337;
const chainId = parseInt(optionalEnv("CHAIN_ID", `${CHAIN_ID_ANVIL}`), 10);

function loadDeploymentAddresses(chain: number): Record<string, string> {
  const target = path.resolve(__dirname, `../../contract/ignition/deployments/chain-${chain}/deployed_addresses.json`);
  if (!fs.existsSync(target)) {
    throw new Error(`Deployment file not found for chainId ${chain}: ${target}`);
  }
  const raw = fs.readFileSync(target, "utf-8");
  return JSON.parse(raw) as Record<string, string>;
}

function resolveContractAddress(contractName: string): string {
  const addresses = loadDeploymentAddresses(chainId);

  if (addresses[contractName]) return addresses[contractName];

  const suffixMatch = Object.entries(addresses).find(([key]) => key.endsWith(`#${contractName}`));
  if (suffixMatch) return suffixMatch[1];

  throw new Error(`Missing contract address for ${contractName} on chainId ${chainId}`);
}

export const config = {
  // Server
  port: parseInt(optionalEnv("PORT", "2567"), 10),
  nodeEnv: optionalEnv("NODE_ENV", "development"),

  // Redis
  redisUri: optionalEnv("REDIS_URI", "redis://localhost:6379"),

  // Privy
  privyAppId: requireEnv("PRIVY_APP_ID"),
  privyAppSecret: requireEnv("PRIVY_APP_SECRET"),

  // Ponder
  ponderUrl: optionalEnv("PONDER_URL", "http://localhost:42069"),

  // Server Identity
  serverId: requireEnv("SERVER_ID") as `0x${string}`,
  controllerPrivateKey: requireEnv("CONTROLLER_PRIVATE_KEY") as `0x${string}`,

  // Contract
  worldContractAddress: resolveContractAddress("World") as `0x${string}`,

  // Exit Tickets
  exitTicketTtlSeconds: parseInt(optionalEnv("EXIT_TICKET_TTL_SECONDS", "86400"), 10),

  // Room Configuration (used in room metadata for matchMaker.query())
  region: optionalEnv("REGION", "us-east"),
  maxClients: parseInt(optionalEnv("MAX_CLIENTS", "50"), 10),
} as const;

export type Config = typeof config;