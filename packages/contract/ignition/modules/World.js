import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("World", (m) => {
  const deployer = m.getAccount(0);

  // Deploy World Contract
  // Constructor args: address _rakeRecipient, address _worldRecipient
  const world = m.contract("World", [deployer, deployer]);

  // Helper to make bytes32 IDs (pads right with zeros)
  const toBytes32 = (text) => {
    const hex = Buffer.from(text, "utf8").toString("hex");
    if (hex.length > 64) {
      throw new Error(`Server id '${text}' too long for bytes32`);
    }
    return `0x${hex.padEnd(64, "0")}`;
  };

  // Default servers to bootstrap on deploy - one per buy-in tier
  const serverConfigs = [
    {
      id: "world_001",
      controller: deployer,
      buyInAmount: 10n ** 16n, // 0.01 ETH
      massPerEth: 1000,
      rakeShareBps: 500, // 5%
      worldShareBps: 300, // 3%
      exitHoldMs: 60_000, // 60s
    },
    {
      id: "world_002",
      controller: deployer,
      buyInAmount: 2n * 10n ** 16n, // 0.02 ETH
      massPerEth: 1000,
      rakeShareBps: 500, // 5%
      worldShareBps: 300, // 3%
      exitHoldMs: 60_000, // 60s
    },
    {
      id: "world_005",
      controller: deployer,
      buyInAmount: 5n * 10n ** 16n, // 0.05 ETH
      massPerEth: 1000,
      rakeShareBps: 500, // 5%
      worldShareBps: 300, // 3%
      exitHoldMs: 60_000, // 60s
    },
  ];

  for (const server of serverConfigs) {
    m.call(
      world,
      "addServer",
      [
        toBytes32(server.id),
        {
          controller: server.controller,
          buyInAmount: server.buyInAmount,
          massPerEth: server.massPerEth,
          rakeShareBps: server.rakeShareBps,
          worldShareBps: server.worldShareBps,
          exitHoldMs: server.exitHoldMs,
        },
      ],
      { id: `addServer_${server.id}` }
    );
  }

  // Fund test wallet with ETH for local development
  m.send("FundTestWallet", "0x40521D8831cf2df0BF3550b762dbAc89786BE6E3", 100n * 10n ** 18n);

  return { world };
});
