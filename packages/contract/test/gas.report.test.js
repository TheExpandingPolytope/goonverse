import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import hardhat from "hardhat";

const { ethers } = hardhat;

const BPS = 10_000n;

function calcSplits(amount, rakeBps, worldBps) {
  const rake = (amount * BigInt(rakeBps)) / BPS;
  const world = (amount * BigInt(worldBps)) / BPS;
  const spawn = amount - rake - world;
  return { spawn, rake, world };
}

async function signExitTicket({ worldAddress, serverId, sessionId, player, payout, deadline, controller }) {
  const packed = ethers.solidityPackedKeccak256(
    ["address", "bytes32", "bytes32", "address", "uint256", "uint256"],
    [worldAddress, serverId, sessionId, player, payout, deadline]
  );
  return controller.signMessage(ethers.getBytes(packed));
}

async function deployWorldFixture() {
  const [owner, controller, alice] = await ethers.getSigners();

  const World = await ethers.getContractFactory("World");
  const world = await World.deploy(owner.address);

  const serverId = ethers.id("SERVER_GAS");
  const config = {
    controller: controller.address,
    buyInAmount: ethers.parseUnits("100", 18),
    massPerEth: 1_000,
    rakeShareBps: 250,
    worldShareBps: 250,
    exitHoldMs: 12_000,
  };
  await world.addServer(serverId, config);

  return { world, serverId, config, owner, controller, alice };
}

function gasToUsd({ gasUsed, gasPriceGwei, ethUsd }) {
  // USD = gasUsed * (gasPriceGwei * 1e-9 ETH/gas) * ethUsd
  return Number(gasUsed) * gasPriceGwei * 1e-9 * ethUsd;
}

describe("Gas (deposit + exit)", function () {
  it("prints gasUsed for deposit and exitWithSignature + rough USD equivalents", async function () {
    const { world, serverId, config, alice, controller } = await loadFixture(deployWorldFixture);

    // --- deposit ---
    const depositTx = await world.connect(alice).deposit(serverId, { value: config.buyInAmount });
    const depositReceipt = await depositTx.wait();

    // --- exitWithSignature ---
    const { spawn: payout } = calcSplits(config.buyInAmount, config.rakeShareBps, config.worldShareBps);
    const sessionId = ethers.id("session-gas");
    const deadline = BigInt(await time.latest()) + 3600n;
    const signature = await signExitTicket({
      worldAddress: await world.getAddress(),
      serverId,
      sessionId,
      player: alice.address,
      payout,
      deadline,
      controller,
    });

    const exitTx = await world.connect(alice).exitWithSignature(serverId, sessionId, payout, deadline, signature);
    const exitReceipt = await exitTx.wait();

    // Sanity: exit succeeded and emitted
    await expect(exitTx).to.emit(world, "Exit").withArgs(alice.address, serverId, sessionId, payout);

    const ethUsd = Number(process.env.ETH_USD ?? "3000");
    const gasPriceScenariosGwei = [1, 5, 10, 20, 50];

    const report = (label, receipt) => {
      const gasUsed = receipt.gasUsed;
      console.log(`\n[gas] ${label}: gasUsed=${gasUsed.toString()}`);
      console.log(`[gas] ${label}: ethUsd=$${ethUsd} (override with ETH_USD=...)`);
      for (const gwei of gasPriceScenariosGwei) {
        const usd = gasToUsd({ gasUsed, gasPriceGwei: gwei, ethUsd });
        console.log(`[gas] ${label}: @${gwei} gwei ~= $${usd.toFixed(4)}`);
      }
    };

    report("deposit", depositReceipt);
    report("exitWithSignature", exitReceipt);
  });
});





