import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import hardhat from "hardhat";

const { ethers } = hardhat;

const BPS = 10_000n;

async function deployWorldFixture() {
  const [owner, controller, alice, bob, other] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const initialSupply = ethers.parseUnits("1000000", 18);
  const token = await MockERC20.deploy(owner.address, initialSupply);

  const World = await ethers.getContractFactory("World");
  const world = await World.deploy(await token.getAddress(), owner.address, owner.address);

  const serverId = ethers.id("SERVER_A");
  const config = {
    controller: controller.address,
    buyInAmount: ethers.parseUnits("100", 18),
    massPerDollar: 1_000,
    rakeShareBps: 250,
    worldShareBps: 250,
    exitHoldMs: 12_000,
  };

  await world.addServer(serverId, config);

  await token.transfer(alice.address, ethers.parseUnits("1000", 18));
  await token.transfer(bob.address, ethers.parseUnits("1000", 18));

  return {
    owner,
    controller,
    alice,
    bob,
    other,
    token,
    world,
    serverId,
    config,
  };
}

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

describe("World", function () {
  describe("Server registry", function () {
    describe("addServer", function () {
      it("emits AddedServer event with correct args", async function () {
        const { world, controller } = await loadFixture(deployWorldFixture);
        const newServerId = ethers.id("SERVER_NEW");
        const newConfig = {
          controller: controller.address,
          buyInAmount: ethers.parseUnits("50", 18),
          massPerDollar: 500,
          rakeShareBps: 100,
          worldShareBps: 100,
          exitHoldMs: 5_000,
        };

        await expect(world.addServer(newServerId, newConfig))
          .to.emit(world, "AddedServer")
          .withArgs(
            newServerId,
            newConfig.controller,
            newConfig.buyInAmount,
            newConfig.massPerDollar,
            newConfig.rakeShareBps,
            newConfig.worldShareBps,
            newConfig.exitHoldMs
          );
      });

      it("stores config correctly and initializes bankroll to zero", async function () {
        const { world, controller } = await loadFixture(deployWorldFixture);
        const newServerId = ethers.id("SERVER_NEW_2");
        const newConfig = {
          controller: controller.address,
          buyInAmount: ethers.parseUnits("200", 18),
          massPerDollar: 2_000,
          rakeShareBps: 300,
          worldShareBps: 200,
          exitHoldMs: 10_000,
        };

        await world.addServer(newServerId, newConfig);

        const [storedConfig, bankroll] = await world.getServer(newServerId);
        expect(storedConfig.controller).to.equal(newConfig.controller);
        expect(storedConfig.buyInAmount).to.equal(newConfig.buyInAmount);
        expect(storedConfig.massPerDollar).to.equal(newConfig.massPerDollar);
        expect(storedConfig.rakeShareBps).to.equal(newConfig.rakeShareBps);
        expect(storedConfig.worldShareBps).to.equal(newConfig.worldShareBps);
        expect(storedConfig.exitHoldMs).to.equal(newConfig.exitHoldMs);
        expect(bankroll).to.equal(0n);
      });

      it("reverts with zero serverId", async function () {
        const { world, controller } = await loadFixture(deployWorldFixture);
        const badConfig = {
          controller: controller.address,
          buyInAmount: ethers.parseUnits("100", 18),
          massPerDollar: 1_000,
          rakeShareBps: 250,
          worldShareBps: 250,
          exitHoldMs: 12_000,
        };
        await expect(world.addServer(ethers.ZeroHash, badConfig)).to.be.revertedWith("serverId=0");
      });

      it("reverts with zero controller", async function () {
        const { world } = await loadFixture(deployWorldFixture);
        const newServerId = ethers.id("SERVER_BAD_CTRL");
        await expect(
          world.addServer(newServerId, {
            controller: ethers.ZeroAddress,
            buyInAmount: ethers.parseUnits("100", 18),
            massPerDollar: 1_000,
            rakeShareBps: 250,
            worldShareBps: 250,
            exitHoldMs: 12_000,
          })
        ).to.be.revertedWith("controller=0");
      });

      it("reverts with zero buyInAmount", async function () {
        const { world, controller } = await loadFixture(deployWorldFixture);
        const newServerId = ethers.id("SERVER_BAD_BUYIN");
        await expect(
          world.addServer(newServerId, {
            controller: controller.address,
            buyInAmount: 0,
            massPerDollar: 1_000,
            rakeShareBps: 250,
            worldShareBps: 250,
            exitHoldMs: 12_000,
          })
        ).to.be.revertedWith("buyIn=0");
      });

      it("reverts with zero massPerDollar", async function () {
        const { world, controller } = await loadFixture(deployWorldFixture);
        const newServerId = ethers.id("SERVER_BAD_MPD");
        await expect(
          world.addServer(newServerId, {
            controller: controller.address,
            buyInAmount: ethers.parseUnits("100", 18),
            massPerDollar: 0,
            rakeShareBps: 250,
            worldShareBps: 250,
            exitHoldMs: 12_000,
          })
        ).to.be.revertedWith("MPD=0");
      });

      it("reverts when fees >= 100%", async function () {
        const { world, controller } = await loadFixture(deployWorldFixture);
        const newServerId = ethers.id("SERVER_BAD_FEES");
        await expect(
          world.addServer(newServerId, {
            controller: controller.address,
            buyInAmount: ethers.parseUnits("100", 18),
            massPerDollar: 1_000,
            rakeShareBps: 5_000,
            worldShareBps: 5_000,
            exitHoldMs: 12_000,
          })
        ).to.be.revertedWith("fees >= 100%");
      });

      it("reverts with duplicate server id", async function () {
        const { world, serverId, config } = await loadFixture(deployWorldFixture);
        await expect(world.addServer(serverId, config)).to.be.revertedWith("server exists");
      });

      it("reverts for non-owner", async function () {
        const { world, controller, alice } = await loadFixture(deployWorldFixture);
        const newServerId = ethers.id("SERVER_NON_OWNER");
        const newConfig = {
          controller: controller.address,
          buyInAmount: ethers.parseUnits("100", 18),
          massPerDollar: 1_000,
          rakeShareBps: 250,
          worldShareBps: 250,
          exitHoldMs: 12_000,
        };
        await expect(world.connect(alice).addServer(newServerId, newConfig)).to.be.revertedWithCustomError(
          world,
          "OwnableUnauthorizedAccount"
        );
      });
    });

    describe("updateServer", function () {
      it("emits UpdatedServer event with correct args", async function () {
        const { world, serverId, config } = await loadFixture(deployWorldFixture);
        const newConfig = {
          controller: config.controller,
          buyInAmount: config.buyInAmount * 2n,
          massPerDollar: 2_000,
          rakeShareBps: 500,
          worldShareBps: 300,
          exitHoldMs: 30_000,
        };

        await expect(world.updateServer(serverId, newConfig))
          .to.emit(world, "UpdatedServer")
          .withArgs(
            serverId,
            newConfig.controller,
            newConfig.buyInAmount,
            newConfig.massPerDollar,
            newConfig.rakeShareBps,
            newConfig.worldShareBps,
            newConfig.exitHoldMs
          );
      });

      it("mutates all config fields correctly", async function () {
        const { world, serverId, config, alice } = await loadFixture(deployWorldFixture);
        const newConfig = {
          controller: alice.address,
          buyInAmount: config.buyInAmount * 3n,
          massPerDollar: 5_000,
          rakeShareBps: 100,
          worldShareBps: 150,
          exitHoldMs: 60_000,
        };

        await world.updateServer(serverId, newConfig);

        const [stored] = await world.getServer(serverId);
        expect(stored.controller).to.equal(newConfig.controller);
        expect(stored.buyInAmount).to.equal(newConfig.buyInAmount);
        expect(stored.massPerDollar).to.equal(newConfig.massPerDollar);
        expect(stored.rakeShareBps).to.equal(newConfig.rakeShareBps);
        expect(stored.worldShareBps).to.equal(newConfig.worldShareBps);
        expect(stored.exitHoldMs).to.equal(newConfig.exitHoldMs);
      });

      it("preserves bankroll after config update", async function () {
        const { world, serverId, config, token, alice } = await loadFixture(deployWorldFixture);

        // Deposit to create non-zero bankroll
        await token.connect(alice).approve(await world.getAddress(), config.buyInAmount);
        await world.connect(alice).deposit(serverId, config.buyInAmount);

        const [, bankrollBefore] = await world.getServer(serverId);
        expect(bankrollBefore).to.be.greaterThan(0n);

        // Update config
        const newConfig = { ...config, buyInAmount: config.buyInAmount * 2n };
        await world.updateServer(serverId, newConfig);

        const [, bankrollAfter] = await world.getServer(serverId);
        expect(bankrollAfter).to.equal(bankrollBefore);
      });

      it("reverts for missing server", async function () {
        const { world, config } = await loadFixture(deployWorldFixture);
        await expect(world.updateServer(ethers.id("MISSING"), config)).to.be.revertedWith("server missing");
      });

      it("reverts with zero controller", async function () {
        const { world, serverId, config } = await loadFixture(deployWorldFixture);
        const badConfig = { ...config, controller: ethers.ZeroAddress };
        await expect(world.updateServer(serverId, badConfig)).to.be.revertedWith("controller=0");
      });

      it("reverts with zero buyInAmount", async function () {
        const { world, serverId, config } = await loadFixture(deployWorldFixture);
        const badConfig = { ...config, buyInAmount: 0 };
        await expect(world.updateServer(serverId, badConfig)).to.be.revertedWith("buyIn=0");
      });

      it("reverts with zero massPerDollar", async function () {
        const { world, serverId, config } = await loadFixture(deployWorldFixture);
        const badConfig = { ...config, massPerDollar: 0 };
        await expect(world.updateServer(serverId, badConfig)).to.be.revertedWith("MPD=0");
      });

      it("reverts when fees >= 100%", async function () {
        const { world, serverId, config } = await loadFixture(deployWorldFixture);
        const badConfig = { ...config, rakeShareBps: 5_000, worldShareBps: 5_000 };
        await expect(world.updateServer(serverId, badConfig)).to.be.revertedWith("fees >= 100%");
      });

      it("reverts for non-owner", async function () {
        const { world, serverId, config, alice } = await loadFixture(deployWorldFixture);
        await expect(world.connect(alice).updateServer(serverId, config)).to.be.revertedWithCustomError(
          world,
          "OwnableUnauthorizedAccount"
        );
      });
    });

    describe("removeServer", function () {
      it("emits RemovedServer event", async function () {
        const { world, serverId } = await loadFixture(deployWorldFixture);
        await expect(world.removeServer(serverId))
          .to.emit(world, "RemovedServer")
          .withArgs(serverId);
      });

      it("deletes server from storage (getServer reverts)", async function () {
        const { world, serverId } = await loadFixture(deployWorldFixture);
        await world.removeServer(serverId);
        await expect(world.getServer(serverId)).to.be.revertedWith("server missing");
      });

      it("allows re-adding server after removal", async function () {
        const { world, serverId, config } = await loadFixture(deployWorldFixture);

        // Remove server
        await world.removeServer(serverId);
        await expect(world.getServer(serverId)).to.be.revertedWith("server missing");

        // Re-add with same serverId
        await expect(world.addServer(serverId, config))
          .to.emit(world, "AddedServer")
          .withArgs(
            serverId,
            config.controller,
            config.buyInAmount,
            config.massPerDollar,
            config.rakeShareBps,
            config.worldShareBps,
            config.exitHoldMs
          );

        // Verify it's back
        const [storedConfig, bankroll] = await world.getServer(serverId);
        expect(storedConfig.controller).to.equal(config.controller);
        expect(bankroll).to.equal(0n);
      });

      it("succeeds after bankroll drained via exit", async function () {
        const { world, serverId, token, config, alice, controller } = await loadFixture(deployWorldFixture);

        // Deposit to create bankroll
        await token.connect(alice).approve(await world.getAddress(), config.buyInAmount);
        await world.connect(alice).deposit(serverId, config.buyInAmount);

        const [, bankrollBefore] = await world.getServer(serverId);
        expect(bankrollBefore).to.be.greaterThan(0n);

        // Exit to drain bankroll
        const sessionId = ethers.id("drain-session");
        const payout = bankrollBefore;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
        const packed = ethers.solidityPackedKeccak256(
          ["address", "bytes32", "bytes32", "address", "uint256", "uint256"],
          [await world.getAddress(), serverId, sessionId, alice.address, payout, deadline]
        );
        const signature = await controller.signMessage(ethers.getBytes(packed));

        await world.connect(alice).exitWithSignature(serverId, sessionId, payout, deadline, signature);

        const [, bankrollAfter] = await world.getServer(serverId);
        expect(bankrollAfter).to.equal(0n);

        // Now removal should succeed
        await expect(world.removeServer(serverId))
          .to.emit(world, "RemovedServer")
          .withArgs(serverId);
      });

      it("reverts for missing server", async function () {
        const { world } = await loadFixture(deployWorldFixture);
        await expect(world.removeServer(ethers.id("NON_EXISTENT"))).to.be.revertedWith("server missing");
      });

      it("reverts when bankroll non-zero", async function () {
        const { world, serverId, token, config, alice } = await loadFixture(deployWorldFixture);
        await token.connect(alice).approve(await world.getAddress(), config.buyInAmount);
        await world.connect(alice).deposit(serverId, config.buyInAmount);
        await expect(world.removeServer(serverId)).to.be.revertedWith("bankroll not empty");
      });

      it("reverts for non-owner", async function () {
        const { world, serverId, alice } = await loadFixture(deployWorldFixture);
        await expect(world.connect(alice).removeServer(serverId)).to.be.revertedWithCustomError(
          world,
          "OwnableUnauthorizedAccount"
        );
      });
    });

    it("all registry functions revert for non-owner", async function () {
      const { world, serverId, config, alice } = await loadFixture(deployWorldFixture);
      await expect(world.connect(alice).addServer(serverId, config)).to.be.revertedWithCustomError(world, "OwnableUnauthorizedAccount");
      await expect(world.connect(alice).updateServer(serverId, config)).to.be.revertedWithCustomError(
        world,
        "OwnableUnauthorizedAccount"
      );
      await expect(world.connect(alice).removeServer(serverId)).to.be.revertedWithCustomError(world, "OwnableUnauthorizedAccount");
    });
  });

  describe("Admin", function () {
    describe("setRakeRecipient", function () {
      it("emits RakeRecipientUpdated event", async function () {
        const { world, alice } = await loadFixture(deployWorldFixture);
        await expect(world.setRakeRecipient(alice.address))
          .to.emit(world, "RakeRecipientUpdated")
          .withArgs(alice.address);
      });

      it("updates rakeRecipient address", async function () {
        const { world, alice } = await loadFixture(deployWorldFixture);
        await world.setRakeRecipient(alice.address);
        expect(await world.rakeRecipient()).to.equal(alice.address);
      });

      it("reverts with zero address", async function () {
        const { world } = await loadFixture(deployWorldFixture);
        await expect(world.setRakeRecipient(ethers.ZeroAddress)).to.be.revertedWith("rake recipient=0");
      });

      it("reverts for non-owner", async function () {
        const { world, alice, bob } = await loadFixture(deployWorldFixture);
        await expect(world.connect(alice).setRakeRecipient(bob.address)).to.be.revertedWithCustomError(
          world,
          "OwnableUnauthorizedAccount"
        );
      });
    });

    describe("setWorldRecipient", function () {
      it("emits WorldRecipientUpdated event", async function () {
        const { world, alice } = await loadFixture(deployWorldFixture);
        await expect(world.setWorldRecipient(alice.address))
          .to.emit(world, "WorldRecipientUpdated")
          .withArgs(alice.address);
      });

      it("updates worldRecipient address", async function () {
        const { world, alice } = await loadFixture(deployWorldFixture);
        await world.setWorldRecipient(alice.address);
        expect(await world.worldRecipient()).to.equal(alice.address);
      });

      it("reverts with zero address", async function () {
        const { world } = await loadFixture(deployWorldFixture);
        await expect(world.setWorldRecipient(ethers.ZeroAddress)).to.be.revertedWith("world recipient=0");
      });

      it("reverts for non-owner", async function () {
        const { world, alice, bob } = await loadFixture(deployWorldFixture);
        await expect(world.connect(alice).setWorldRecipient(bob.address)).to.be.revertedWithCustomError(
          world,
          "OwnableUnauthorizedAccount"
        );
      });
    });

    describe("sweep", function () {
      it("transfers tokens to recipient", async function () {
        const { world, token, owner, alice } = await loadFixture(deployWorldFixture);
        const sweepAmount = ethers.parseUnits("100", 18);

        // Send tokens to the contract
        await token.transfer(await world.getAddress(), sweepAmount);

        const aliceBalanceBefore = await token.balanceOf(alice.address);
        await world.sweep(await token.getAddress(), alice.address, sweepAmount);
        const aliceBalanceAfter = await token.balanceOf(alice.address);

        expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(sweepAmount);
      });

      it("can sweep non-asset tokens", async function () {
        const { world, owner, alice } = await loadFixture(deployWorldFixture);

        // Deploy another token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const otherToken = await MockERC20.deploy(owner.address, ethers.parseUnits("1000", 18));
        const sweepAmount = ethers.parseUnits("50", 18);

        // Send other token to the contract
        await otherToken.transfer(await world.getAddress(), sweepAmount);

        const aliceBalanceBefore = await otherToken.balanceOf(alice.address);
        await world.sweep(await otherToken.getAddress(), alice.address, sweepAmount);
        const aliceBalanceAfter = await otherToken.balanceOf(alice.address);

        expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(sweepAmount);
      });

      it("reverts with zero recipient", async function () {
        const { world, token } = await loadFixture(deployWorldFixture);
        await expect(world.sweep(await token.getAddress(), ethers.ZeroAddress, 100n)).to.be.revertedWith("to=0");
      });

      it("reverts for non-owner", async function () {
        const { world, token, alice, bob } = await loadFixture(deployWorldFixture);
        await expect(world.connect(alice).sweep(await token.getAddress(), bob.address, 100n)).to.be.revertedWithCustomError(
          world,
          "OwnableUnauthorizedAccount"
        );
      });
    });
  });

  describe("Deposits", function () {
    describe("deposit", function () {
      it("emits Deposit event with correct args", async function () {
        const { world, token, serverId, config, alice } = await loadFixture(deployWorldFixture);
        const amount = config.buyInAmount;
        const worldAddress = await world.getAddress();
        await token.connect(alice).approve(worldAddress, amount);

        const { spawn, rake, world: worldFee } = calcSplits(amount, config.rakeShareBps, config.worldShareBps);
        const expectedDepositId = ethers.solidityPackedKeccak256(["bytes32", "address", "uint256"], [serverId, alice.address, 1n]);

        await expect(world.connect(alice).deposit(serverId, amount))
          .to.emit(world, "Deposit")
          .withArgs(alice.address, serverId, expectedDepositId, amount, spawn, worldFee, rake);
      });

      it("transfers buy-in from player to contract", async function () {
        const { world, token, serverId, config, alice } = await loadFixture(deployWorldFixture);
        const amount = config.buyInAmount;
        const worldAddress = await world.getAddress();
        await token.connect(alice).approve(worldAddress, amount);

        const aliceBalanceBefore = await token.balanceOf(alice.address);
        await world.connect(alice).deposit(serverId, amount);
        const aliceBalanceAfter = await token.balanceOf(alice.address);

        expect(aliceBalanceBefore - aliceBalanceAfter).to.equal(amount);
      });

      it("sends rake to rakeRecipient", async function () {
        const { world, token, serverId, config, alice, owner } = await loadFixture(deployWorldFixture);
        const amount = config.buyInAmount;
        const worldAddress = await world.getAddress();
        await token.connect(alice).approve(worldAddress, amount);

        const { rake } = calcSplits(amount, config.rakeShareBps, config.worldShareBps);
        const rakeRecipientBefore = await token.balanceOf(owner.address);

        await world.connect(alice).deposit(serverId, amount);

        const rakeRecipientAfter = await token.balanceOf(owner.address);
        // Owner is both rake and world recipient, so receives both
        expect(rakeRecipientAfter - rakeRecipientBefore).to.be.greaterThanOrEqual(rake);
      });

      it("sends worldFee to worldRecipient", async function () {
        const { world, token, serverId, config, alice, owner } = await loadFixture(deployWorldFixture);
        const amount = config.buyInAmount;
        const worldAddress = await world.getAddress();
        await token.connect(alice).approve(worldAddress, amount);

        const { rake, world: worldFee } = calcSplits(amount, config.rakeShareBps, config.worldShareBps);
        const worldRecipientBefore = await token.balanceOf(owner.address);

        await world.connect(alice).deposit(serverId, amount);

        const worldRecipientAfter = await token.balanceOf(owner.address);
        // Owner is both rake and world recipient
        expect(worldRecipientAfter - worldRecipientBefore).to.equal(rake + worldFee);
      });

      it("credits spawn amount to bankroll", async function () {
        const { world, token, serverId, config, alice } = await loadFixture(deployWorldFixture);
        const amount = config.buyInAmount;
        const worldAddress = await world.getAddress();
        await token.connect(alice).approve(worldAddress, amount);

        const { spawn } = calcSplits(amount, config.rakeShareBps, config.worldShareBps);

        const [, bankrollBefore] = await world.getServer(serverId);
        await world.connect(alice).deposit(serverId, amount);
        const [, bankrollAfter] = await world.getServer(serverId);

        expect(bankrollAfter - bankrollBefore).to.equal(spawn);
      });

      it("increments depositNonce and generates unique depositId", async function () {
        const { world, token, serverId, config, alice } = await loadFixture(deployWorldFixture);
        const amount = config.buyInAmount;
        const worldAddress = await world.getAddress();
        const { spawn, rake, world: worldFee } = calcSplits(amount, config.rakeShareBps, config.worldShareBps);

        // First deposit
        await token.connect(alice).approve(worldAddress, amount * 2n);
        const expectedDepositId1 = ethers.solidityPackedKeccak256(["bytes32", "address", "uint256"], [serverId, alice.address, 1n]);

        await expect(world.connect(alice).deposit(serverId, amount))
          .to.emit(world, "Deposit")
          .withArgs(alice.address, serverId, expectedDepositId1, amount, spawn, worldFee, rake);

        // Second deposit - nonce should increment
        const expectedDepositId2 = ethers.solidityPackedKeccak256(["bytes32", "address", "uint256"], [serverId, alice.address, 2n]);

        await expect(world.connect(alice).deposit(serverId, amount))
          .to.emit(world, "Deposit")
          .withArgs(alice.address, serverId, expectedDepositId2, amount, spawn, worldFee, rake);

        // Verify IDs are different
        expect(expectedDepositId1).to.not.equal(expectedDepositId2);
      });

      it("allows multiple deposits from same player", async function () {
        const { world, token, serverId, config, alice } = await loadFixture(deployWorldFixture);
        const amount = config.buyInAmount;
        const worldAddress = await world.getAddress();
        const { spawn } = calcSplits(amount, config.rakeShareBps, config.worldShareBps);

        await token.connect(alice).approve(worldAddress, amount * 3n);

        await world.connect(alice).deposit(serverId, amount);
        await world.connect(alice).deposit(serverId, amount);
        await world.connect(alice).deposit(serverId, amount);

        const [, bankroll] = await world.getServer(serverId);
        expect(bankroll).to.equal(spawn * 3n);
      });

      it("allows deposits from different players", async function () {
        const { world, token, serverId, config, alice, bob } = await loadFixture(deployWorldFixture);
        const amount = config.buyInAmount;
        const worldAddress = await world.getAddress();
        const { spawn } = calcSplits(amount, config.rakeShareBps, config.worldShareBps);

        await token.connect(alice).approve(worldAddress, amount);
        await token.connect(bob).approve(worldAddress, amount);

        await world.connect(alice).deposit(serverId, amount);
        await world.connect(bob).deposit(serverId, amount);

        const [, bankroll] = await world.getServer(serverId);
        expect(bankroll).to.equal(spawn * 2n);
      });

      it("reverts on wrong buy-in amount (too low)", async function () {
        const { world, token, serverId, config, alice } = await loadFixture(deployWorldFixture);
        const worldAddress = await world.getAddress();
        await token.connect(alice).approve(worldAddress, config.buyInAmount);
        await expect(world.connect(alice).deposit(serverId, config.buyInAmount - 1n)).to.be.revertedWith("invalid buy-in");
      });

      it("reverts on wrong buy-in amount (too high)", async function () {
        const { world, token, serverId, config, alice } = await loadFixture(deployWorldFixture);
        const worldAddress = await world.getAddress();
        await token.connect(alice).approve(worldAddress, config.buyInAmount * 2n);
        await expect(world.connect(alice).deposit(serverId, config.buyInAmount + 1n)).to.be.revertedWith("invalid buy-in");
      });

      it("reverts for missing server", async function () {
        const { world, token, config, alice } = await loadFixture(deployWorldFixture);
        const worldAddress = await world.getAddress();
        await token.connect(alice).approve(worldAddress, config.buyInAmount);
        await expect(world.connect(alice).deposit(ethers.id("NON_EXISTENT"), config.buyInAmount)).to.be.revertedWith("server missing");
      });

      it("reverts when player has no allowance", async function () {
        const { world, serverId, config, alice } = await loadFixture(deployWorldFixture);
        // No approve call
        await expect(world.connect(alice).deposit(serverId, config.buyInAmount)).to.be.reverted;
      });

      it("reverts when player has insufficient balance", async function () {
        const { world, token, serverId, config, other } = await loadFixture(deployWorldFixture);
        const worldAddress = await world.getAddress();
        // other has no tokens (not funded in fixture)
        await token.connect(other).approve(worldAddress, config.buyInAmount);
        await expect(world.connect(other).deposit(serverId, config.buyInAmount)).to.be.reverted;
      });
    });
  });

  describe("Exits", function () {
    async function prepareDeposit() {
      const fixture = await loadFixture(deployWorldFixture);
      const { world, token, serverId, config, alice } = fixture;
      await token.connect(alice).approve(await world.getAddress(), config.buyInAmount);
      await world.connect(alice).deposit(serverId, config.buyInAmount);
      return fixture;
    }

    describe("exitWithSignature", function () {
      it("emits Exit event with correct args", async function () {
        const { world, serverId, config, alice, controller } = await prepareDeposit();
        const sessionId = ethers.id("session-1");
        const payout = calcSplits(config.buyInAmount, config.rakeShareBps, config.worldShareBps).spawn;
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

        await expect(world.connect(alice).exitWithSignature(serverId, sessionId, payout, deadline, signature))
          .to.emit(world, "Exit")
          .withArgs(alice.address, serverId, sessionId, payout);
      });

      it("transfers payout to player", async function () {
        const { world, token, serverId, config, alice, controller } = await prepareDeposit();
        const sessionId = ethers.id("session-transfer");
        const payout = calcSplits(config.buyInAmount, config.rakeShareBps, config.worldShareBps).spawn;
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

        const aliceBalanceBefore = await token.balanceOf(alice.address);
        await world.connect(alice).exitWithSignature(serverId, sessionId, payout, deadline, signature);
        const aliceBalanceAfter = await token.balanceOf(alice.address);

        expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(payout);
      });

      it("decreases bankroll by payout amount", async function () {
        const { world, serverId, config, alice, controller } = await prepareDeposit();
        const sessionId = ethers.id("session-bankroll");
        const payout = calcSplits(config.buyInAmount, config.rakeShareBps, config.worldShareBps).spawn;
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

        const [, bankrollBefore] = await world.getServer(serverId);
        await world.connect(alice).exitWithSignature(serverId, sessionId, payout, deadline, signature);
        const [, bankrollAfter] = await world.getServer(serverId);

        expect(bankrollBefore - bankrollAfter).to.equal(payout);
      });

      it("marks session as exited in exitedSessions mapping", async function () {
        const { world, serverId, config, alice, controller } = await prepareDeposit();
        const sessionId = ethers.id("session-marked");
        const payout = calcSplits(config.buyInAmount, config.rakeShareBps, config.worldShareBps).spawn;
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

        expect(await world.exitedSessions(serverId, sessionId)).to.equal(false);
        await world.connect(alice).exitWithSignature(serverId, sessionId, payout, deadline, signature);
        expect(await world.exitedSessions(serverId, sessionId)).to.equal(true);
      });

      it("allows partial payout (less than full bankroll)", async function () {
        const { world, token, serverId, config, alice, controller } = await prepareDeposit();
        const sessionId = ethers.id("session-partial");
        const fullPayout = calcSplits(config.buyInAmount, config.rakeShareBps, config.worldShareBps).spawn;
        const partialPayout = fullPayout / 2n;
        const deadline = BigInt(await time.latest()) + 3600n;
        const signature = await signExitTicket({
          worldAddress: await world.getAddress(),
          serverId,
          sessionId,
          player: alice.address,
          payout: partialPayout,
          deadline,
          controller,
        });

        await expect(world.connect(alice).exitWithSignature(serverId, sessionId, partialPayout, deadline, signature))
          .to.emit(world, "Exit")
          .withArgs(alice.address, serverId, sessionId, partialPayout);

        const [, bankrollAfter] = await world.getServer(serverId);
        expect(bankrollAfter).to.equal(fullPayout - partialPayout);
      });

      it("allows multiple exits from different sessions", async function () {
        const { world, token, serverId, config, alice, bob, controller } = await prepareDeposit();

        // Bob also deposits
        await token.connect(bob).approve(await world.getAddress(), config.buyInAmount);
        await world.connect(bob).deposit(serverId, config.buyInAmount);

        const spawnPerDeposit = calcSplits(config.buyInAmount, config.rakeShareBps, config.worldShareBps).spawn;
        const deadline = BigInt(await time.latest()) + 3600n;

        // Alice exits
        const sessionId1 = ethers.id("session-alice");
        const payout1 = spawnPerDeposit / 2n;
        const sig1 = await signExitTicket({
          worldAddress: await world.getAddress(),
          serverId,
          sessionId: sessionId1,
          player: alice.address,
          payout: payout1,
          deadline,
          controller,
        });
        await world.connect(alice).exitWithSignature(serverId, sessionId1, payout1, deadline, sig1);

        // Bob exits
        const sessionId2 = ethers.id("session-bob");
        const payout2 = spawnPerDeposit / 2n;
        const sig2 = await signExitTicket({
          worldAddress: await world.getAddress(),
          serverId,
          sessionId: sessionId2,
          player: bob.address,
          payout: payout2,
          deadline,
          controller,
        });
        await world.connect(bob).exitWithSignature(serverId, sessionId2, payout2, deadline, sig2);

        const [, bankrollAfter] = await world.getServer(serverId);
        expect(bankrollAfter).to.equal(spawnPerDeposit * 2n - payout1 - payout2);
      });

      it("reverts with reused ticket (session claimed)", async function () {
        const { world, serverId, config, alice, controller } = await prepareDeposit();
        const sessionId = ethers.id("session-replay");
        const payout = calcSplits(config.buyInAmount, config.rakeShareBps, config.worldShareBps).spawn;
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

        await world.connect(alice).exitWithSignature(serverId, sessionId, payout, deadline, signature);
        await expect(world.connect(alice).exitWithSignature(serverId, sessionId, payout, deadline, signature)).to.be.revertedWith(
          "session claimed"
        );
      });

      it("reverts with wrong signer", async function () {
        const { world, serverId, config, alice, bob } = await prepareDeposit();
        const sessionId = ethers.id("bad-signer");
        const payout = calcSplits(config.buyInAmount, config.rakeShareBps, config.worldShareBps).spawn;
        const deadline = BigInt(await time.latest()) + 3600n;
        const signature = await signExitTicket({
          worldAddress: await world.getAddress(),
          serverId,
          sessionId,
          player: alice.address,
          payout,
          deadline,
          controller: bob, // bob is not the controller
        });

        await expect(world.connect(alice).exitWithSignature(serverId, sessionId, payout, deadline, signature)).to.be.revertedWith(
          "bad signature"
        );
      });

      it("reverts with expired deadline", async function () {
        const { world, serverId, config, alice, controller } = await prepareDeposit();
        const sessionId = ethers.id("session-expired");
        const payout = calcSplits(config.buyInAmount, config.rakeShareBps, config.worldShareBps).spawn;
        const deadline = BigInt(await time.latest()) - 1n; // Already expired
        const signature = await signExitTicket({
          worldAddress: await world.getAddress(),
          serverId,
          sessionId,
          player: alice.address,
          payout,
          deadline,
          controller,
        });

        await expect(world.connect(alice).exitWithSignature(serverId, sessionId, payout, deadline, signature)).to.be.revertedWith(
          "ticket expired"
        );
      });

      it("reverts when payout exceeds bankroll", async function () {
        const { world, serverId, config, alice, controller } = await prepareDeposit();
        const sessionId = ethers.id("session-exceed");
        const [, bankroll] = await world.getServer(serverId);
        const payout = bankroll + 1n; // More than available
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

        await expect(world.connect(alice).exitWithSignature(serverId, sessionId, payout, deadline, signature)).to.be.revertedWith(
          "insufficient bankroll"
        );
      });

      it("reverts when payout is zero", async function () {
        const { world, serverId, config, alice, controller } = await prepareDeposit();
        const sessionId = ethers.id("session-zero");
        const payout = 0n;
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

        await expect(world.connect(alice).exitWithSignature(serverId, sessionId, payout, deadline, signature)).to.be.revertedWith(
          "payout=0"
        );
      });

      it("reverts for missing server", async function () {
        const { world, config, alice, controller } = await prepareDeposit();
        const missingServerId = ethers.id("MISSING_SERVER");
        const sessionId = ethers.id("session-missing");
        const payout = calcSplits(config.buyInAmount, config.rakeShareBps, config.worldShareBps).spawn;
        const deadline = BigInt(await time.latest()) + 3600n;
        const signature = await signExitTicket({
          worldAddress: await world.getAddress(),
          serverId: missingServerId,
          sessionId,
          player: alice.address,
          payout,
          deadline,
          controller,
        });

        await expect(world.connect(alice).exitWithSignature(missingServerId, sessionId, payout, deadline, signature)).to.be.revertedWith(
          "server missing"
        );
      });

      it("reverts when caller is not the ticket player", async function () {
        const { world, serverId, config, alice, bob, controller } = await prepareDeposit();
        const sessionId = ethers.id("session-wrong-caller");
        const payout = calcSplits(config.buyInAmount, config.rakeShareBps, config.worldShareBps).spawn;
        const deadline = BigInt(await time.latest()) + 3600n;
        // Ticket is signed for alice
        const signature = await signExitTicket({
          worldAddress: await world.getAddress(),
          serverId,
          sessionId,
          player: alice.address,
          payout,
          deadline,
          controller,
        });

        // Bob tries to use alice's ticket
        await expect(world.connect(bob).exitWithSignature(serverId, sessionId, payout, deadline, signature)).to.be.revertedWith(
          "bad signature"
        );
      });

      it("reverts with tampered payout amount", async function () {
        const { world, serverId, config, alice, controller } = await prepareDeposit();
        const sessionId = ethers.id("session-tamper-payout");
        const originalPayout = calcSplits(config.buyInAmount, config.rakeShareBps, config.worldShareBps).spawn;
        const tamperedPayout = originalPayout / 2n; // Smaller amount to avoid bankroll check
        const deadline = BigInt(await time.latest()) + 3600n;
        // Sign with original payout
        const signature = await signExitTicket({
          worldAddress: await world.getAddress(),
          serverId,
          sessionId,
          player: alice.address,
          payout: originalPayout,
          deadline,
          controller,
        });

        // Try to claim with tampered payout (different from signed amount)
        await expect(world.connect(alice).exitWithSignature(serverId, sessionId, tamperedPayout, deadline, signature)).to.be.revertedWith(
          "bad signature"
        );
      });

      it("reverts with tampered sessionId", async function () {
        const { world, serverId, config, alice, controller } = await prepareDeposit();
        const originalSessionId = ethers.id("session-original");
        const tamperedSessionId = ethers.id("session-tampered");
        const payout = calcSplits(config.buyInAmount, config.rakeShareBps, config.worldShareBps).spawn;
        const deadline = BigInt(await time.latest()) + 3600n;
        // Sign with original sessionId
        const signature = await signExitTicket({
          worldAddress: await world.getAddress(),
          serverId,
          sessionId: originalSessionId,
          player: alice.address,
          payout,
          deadline,
          controller,
        });

        // Try to claim with tampered sessionId
        await expect(world.connect(alice).exitWithSignature(serverId, tamperedSessionId, payout, deadline, signature)).to.be.revertedWith(
          "bad signature"
        );
      });

      it("reverts with tampered serverId", async function () {
        const { world, serverId, config, alice, controller, owner, token } = await prepareDeposit();
        const sessionId = ethers.id("session-tamper-server");
        const payout = calcSplits(config.buyInAmount, config.rakeShareBps, config.worldShareBps).spawn;
        const deadline = BigInt(await time.latest()) + 3600n;

        // Create another server and fund it
        const otherServerId = ethers.id("OTHER_SERVER");
        await world.addServer(otherServerId, config);
        await token.connect(alice).approve(await world.getAddress(), config.buyInAmount);
        await world.connect(alice).deposit(otherServerId, config.buyInAmount);

        // Sign for original server
        const signature = await signExitTicket({
          worldAddress: await world.getAddress(),
          serverId,
          sessionId,
          player: alice.address,
          payout,
          deadline,
          controller,
        });

        // Try to claim on other server (signature was for original server)
        await expect(world.connect(alice).exitWithSignature(otherServerId, sessionId, payout, deadline, signature)).to.be.revertedWith(
          "bad signature"
        );
      });
    });
  });
});


