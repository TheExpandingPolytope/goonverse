/**
 * World Contract ABI
 * 
 * Only includes the functions and events needed by the frontend:
 * - deposit: For depositing ETH to join a game
 * - Deposit: Event emitted after successful deposit
 * - getServer: To read server configuration
 */
export const WorldAbi = [
  // Deposit function
  {
    inputs: [{ internalType: "bytes32", name: "serverId", type: "bytes32" }],
    name: "deposit",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  // Deposit event
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "player", type: "address" },
      { indexed: true, internalType: "bytes32", name: "serverId", type: "bytes32" },
      { indexed: true, internalType: "bytes32", name: "depositId", type: "bytes32" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "spawnAmount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "worldAmount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "developerAmount", type: "uint256" },
    ],
    name: "Deposit",
    type: "event",
  },
  // Exit function (for claiming exit ticket)
  {
    inputs: [
      { internalType: "bytes32", name: "serverId", type: "bytes32" },
      { internalType: "bytes32", name: "sessionId", type: "bytes32" },
      { internalType: "uint256", name: "payout", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "bytes", name: "signature", type: "bytes" },
    ],
    name: "exitWithSignature",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Exit event
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "player", type: "address" },
      { indexed: true, internalType: "bytes32", name: "serverId", type: "bytes32" },
      { indexed: true, internalType: "bytes32", name: "sessionId", type: "bytes32" },
      { indexed: false, internalType: "uint256", name: "payout", type: "uint256" },
    ],
    name: "Exit",
    type: "event",
  },
  // Get server config
  {
    inputs: [{ internalType: "bytes32", name: "serverId", type: "bytes32" }],
    name: "getServer",
    outputs: [
      {
        components: [
          { internalType: "address", name: "controller", type: "address" },
          { internalType: "uint96", name: "buyInAmount", type: "uint96" },
          { internalType: "uint32", name: "massPerEth", type: "uint32" },
          { internalType: "uint16", name: "developerFeeBps", type: "uint16" },
          { internalType: "uint16", name: "worldFeeBps", type: "uint16" },
          { internalType: "uint32", name: "exitHoldMs", type: "uint32" },
        ],
        internalType: "struct World.ServerConfig",
        name: "config",
        type: "tuple",
      },
      { internalType: "uint256", name: "bankroll", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const

