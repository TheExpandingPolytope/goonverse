// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract World is Ownable, ReentrancyGuard {
    using MessageHashUtils for bytes32;

    uint256 private constant BPS = 10_000; // 100% = 10_000 bps

    struct ServerConfig {
        address controller;
        uint96 buyInAmount;
        uint32 massPerDollar;
        uint16 rakeShareBps;
        uint16 worldShareBps;
        uint32 exitHoldMs;
    }

    struct ServerState {
        ServerConfig config;
        uint256 bankroll; // spawn liquidity held in contract
        bool exists;
    }

    IERC20 public immutable asset; // e.g. USDC
    address public rakeRecipient;
    address public worldRecipient;

    // serverId => ServerState
    mapping(bytes32 => ServerState) private servers;

    // serverId => sessionId => consumed
    mapping(bytes32 => mapping(bytes32 => bool)) public exitedSessions;

    uint256 public depositNonce;

    event RakeRecipientUpdated(address indexed recipient);
    event WorldRecipientUpdated(address indexed recipient);

    event AddedServer(
        bytes32 indexed serverId,
        address indexed controller,
        uint96 buyInAmount,
        uint32 massPerDollar,
        uint16 rakeShareBps,
        uint16 worldShareBps,
        uint32 exitHoldMs
    );

    event UpdatedServer(
        bytes32 indexed serverId,
        address indexed controller,
        uint96 buyInAmount,
        uint32 massPerDollar,
        uint16 rakeShareBps,
        uint16 worldShareBps,
        uint32 exitHoldMs
    );

    event RemovedServer(bytes32 indexed serverId);

    event Deposit(
        address indexed player,
        bytes32 indexed serverId,
        bytes32 indexed depositId,
        uint256 amount,
        uint256 spawnAmount,
        uint256 worldAmount,
        uint256 rakeAmount
    );

    event Exit(
        address indexed player,
        bytes32 indexed serverId,
        bytes32 indexed sessionId,
        uint256 payout
    );

    constructor(
        IERC20 _asset,
        address _rakeRecipient,
        address _worldRecipient
    ) Ownable(msg.sender) {
        require(address(_asset) != address(0), "asset=0");
        asset = _asset;
        _updateRakeRecipient(_rakeRecipient);
        _updateWorldRecipient(_worldRecipient);
    }

    // --- Admin ---

    function addServer(bytes32 serverId, ServerConfig calldata config) external onlyOwner {
        require(serverId != bytes32(0), "serverId=0");
        require(!servers[serverId].exists, "server exists");
        _validateConfig(config);

        servers[serverId] = ServerState({config: config, bankroll: 0, exists: true});

        emit AddedServer(
            serverId,
            config.controller,
            config.buyInAmount,
            config.massPerDollar,
            config.rakeShareBps,
            config.worldShareBps,
            config.exitHoldMs
        );
    }

    function updateServer(bytes32 serverId, ServerConfig calldata config) external onlyOwner {
        ServerState storage state = servers[serverId];
        require(state.exists, "server missing");
        _validateConfig(config);

        state.config = config;

        emit UpdatedServer(
            serverId,
            config.controller,
            config.buyInAmount,
            config.massPerDollar,
            config.rakeShareBps,
            config.worldShareBps,
            config.exitHoldMs
        );
    }

    function removeServer(bytes32 serverId) external onlyOwner {
        ServerState storage state = servers[serverId];
        require(state.exists, "server missing");
        require(state.bankroll == 0, "bankroll not empty");
        delete servers[serverId];
        emit RemovedServer(serverId);
    }

    function setRakeRecipient(address recipient) external onlyOwner {
        _updateRakeRecipient(recipient);
    }

    function setWorldRecipient(address recipient) external onlyOwner {
        _updateWorldRecipient(recipient);
    }

    function sweep(IERC20 token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "to=0");
        require(token.transfer(to, amount), "transfer fail");
    }

    // --- Gameplay ---

    function deposit(bytes32 serverId, uint256 amount) external nonReentrant {
        ServerState storage state = servers[serverId];
        require(state.exists, "server missing");
        require(amount == state.config.buyInAmount, "invalid buy-in");

        require(asset.transferFrom(msg.sender, address(this), amount), "transferFrom fail");

        uint256 rakeAmount = (amount * state.config.rakeShareBps) / BPS;
        uint256 worldAmount = (amount * state.config.worldShareBps) / BPS;
        require(rakeAmount + worldAmount < amount, "fees too high");
        uint256 spawnAmount = amount - rakeAmount - worldAmount;

        if (rakeAmount > 0) {
            require(rakeRecipient != address(0), "rake recipient unset");
            require(asset.transfer(rakeRecipient, rakeAmount), "rake transfer fail");
        }

        if (worldAmount > 0) {
            require(worldRecipient != address(0), "world recipient unset");
            require(asset.transfer(worldRecipient, worldAmount), "world transfer fail");
        }

        state.bankroll += spawnAmount;

        bytes32 depositId = keccak256(abi.encodePacked(serverId, msg.sender, ++depositNonce));
        emit Deposit(msg.sender, serverId, depositId, amount, spawnAmount, worldAmount, rakeAmount);
    }

    function exitWithSignature(
        bytes32 serverId,
        bytes32 sessionId,
        uint256 payout,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        ServerState storage state = servers[serverId];
        require(state.exists, "server missing");
        require(block.timestamp <= deadline, "ticket expired");
        require(!exitedSessions[serverId][sessionId], "session claimed");
        require(payout > 0, "payout=0");
        require(payout <= state.bankroll, "insufficient bankroll");

        bytes32 digest = keccak256(
            abi.encodePacked(
                address(this),
                serverId,
                sessionId,
                msg.sender,
                payout,
                deadline
            )
        ).toEthSignedMessageHash();

        address signer = ECDSA.recover(digest, signature);
        require(signer == state.config.controller, "bad signature");

        exitedSessions[serverId][sessionId] = true;
        state.bankroll -= payout;

        require(asset.transfer(msg.sender, payout), "transfer fail");

        emit Exit(msg.sender, serverId, sessionId, payout);
    }

    // --- Views ---

    function getServer(bytes32 serverId) external view returns (ServerConfig memory config, uint256 bankroll) {
        ServerState storage state = servers[serverId];
        require(state.exists, "server missing");
        return (state.config, state.bankroll);
    }

    // --- Internal helpers ---

    function _validateConfig(ServerConfig calldata config) private pure {
        require(config.controller != address(0), "controller=0");
        require(config.buyInAmount > 0, "buyIn=0");
        require(config.massPerDollar > 0, "MPD=0");
        require(config.rakeShareBps + config.worldShareBps < BPS, "fees >= 100%" );
    }

    function _updateRakeRecipient(address recipient) private {
        require(recipient != address(0), "rake recipient=0");
        rakeRecipient = recipient;
        emit RakeRecipientUpdated(recipient);
    }

    function _updateWorldRecipient(address recipient) private {
        require(recipient != address(0), "world recipient=0");
        worldRecipient = recipient;
        emit WorldRecipientUpdated(recipient);
    }
}
