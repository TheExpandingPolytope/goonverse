/**
 * Environment configuration with validation
 */

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
  worldContractAddress: requireEnv("WORLD_CONTRACT_ADDRESS") as `0x${string}`,

  // Exit Tickets
  exitTicketTtlSeconds: parseInt(optionalEnv("EXIT_TICKET_TTL_SECONDS", "86400"), 10),
} as const;

export type Config = typeof config;

