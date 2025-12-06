import { createConfig } from "ponder";

import { WorldAbi } from "./abis/WorldAbi";

// Determine active chain from environment
const activeChain = process.env.PONDER_CHAIN || "anvil";

// Contract address
const worldAddress = process.env.WORLD_CONTRACT_ADDRESS as `0x${string}`;

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
