import { createConfig } from "ponder";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WorldAbi } from "./abis/WorldAbi";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine active chain from environment
const activeChain = process.env.PONDER_CHAIN || "anvil";

function loadDeploymentAddresses(chain: number): Record<string, string> {
  const target = path.resolve(__dirname, `../contract/ignition/deployments/chain-${chain}/deployed_addresses.json`);
  if (!fs.existsSync(target)) {
    throw new Error(`Deployment file not found for chainId ${chain}: ${target}`);
  }
  return JSON.parse(fs.readFileSync(target, "utf-8")) as Record<string, string>;
}

function resolveContractAddress(chainId: number, contractName: string): `0x${string}` {
  const addresses = loadDeploymentAddresses(chainId);

  if (addresses[contractName]) {
    return addresses[contractName] as `0x${string}`;
  }

  const suffixMatch = Object.entries(addresses).find(([key]) => key.endsWith(`#${contractName}`));
  if (suffixMatch) {
    return suffixMatch[1] as `0x${string}`;
  }

  throw new Error(`Missing contract address for ${contractName} on chainId ${chainId}`);
}

// Contract address
const chainIdByName = {
  anvil: 31337,
  base: 8453,
  baseSepolia: 84532,
} as const;

const envChainId = Number(process.env.PONDER_CHAIN_ID);
const activeChainKey = (activeChain in chainIdByName ? activeChain : "anvil") as keyof typeof chainIdByName;
const chainIdFromName: number = chainIdByName[activeChainKey];
const activeChainId = Number.isFinite(envChainId) ? envChainId : chainIdFromName;
const worldAddress = resolveContractAddress(activeChainId, "World");

// Chain-specific configurations
const chainConfigs = {
  base: {
    id: 8453,
    rpc: process.env.PONDER_RPC_URL_8453!,
    startBlock: Number(process.env.WORLD_START_BLOCK_BASE) || 0,
  },
  baseSepolia: {
    id: 84532,
    rpc: process.env.PONDER_RPC_URL_84532!,
    startBlock: Number(process.env.WORLD_START_BLOCK_SEPOLIA) || 0,
  },
  anvil: {
    id: 31337,
    rpc: process.env.PONDER_RPC_URL_31337 || "http://127.0.0.1:8545",
    startBlock: 0,
  },
} as const;

// Get active chain config
const chain = chainConfigs[activeChain as keyof typeof chainConfigs] ?? chainConfigs.anvil;
const chainName = (activeChain in chainConfigs ? activeChain : "anvil") as keyof typeof chainConfigs;

export default createConfig({
  chains: {
    [chainName]: {
      id: chain.id,
      rpc: chain.rpc,
    },
  },
  contracts: {
    World: {
      chain: chainName,
      abi: WorldAbi,
      address: worldAddress,
      startBlock: chain.startBlock,
    },
  },
});
