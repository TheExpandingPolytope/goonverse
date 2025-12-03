// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract WorldContract is Ownable {
    struct WorldParams {
        uint256 baseBuyIn;      // e.g. 5e6 (example: 5 USDC)
        uint256 massPerDollar;  // e.g. 100e6 (example: 1 USDC = 100 Mass)
        uint256 rakeShare;        // e.g. 0.025e6 (example: 2.5%)
        uint256 worldShare;       // e.g. 0.025e6 (example: 2.5%)
    }

    /// @notice Tokens and addresses
    IERC20 public usdc;
    address public treasury;
    address public server;

    WorldParams public world;

    // Claimable balance per player
    mapping(address => uint256) public claimable;
    uint256 public totalPendingClaims;

    /// @notice Events for game functions
    event Deposit(address indexed player, uint256 spawnAmount, uint256 rakeAmount, uint256 worldAmount);
    event Round(bytes32 indexed roundId, uint256 totalPayoutUSDC);
    event Claim(address indexed player, uint256 amount);

    /// @notice Events for admin functions
    event ServerUpdated(address newServer);
    event TreasuryUpdated(address newTreasury);
    event WorldUpdated(uint256 baseBuyIn, uint256 massPerDollar, uint256 rakeShare, uint256 worldShare);

    constructor(
        address _usdc,
        address _treasury,
        address _server,
        WorldParams memory _world
    ) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        treasury = _treasury;
        server = _server;
        world = _world;
    }

    modifier onlyServer() {
        require(msg.sender == server, "Caller is not the server");
        _;
    }

    /// @notice User deposits USDC to join the game.
    /// @param amount Must match the baseBuyIn (or we can allow multiples, but spec implies fixed buy-in).
    function deposit(uint256 amount) external {
        require(amount == world.baseBuyIn, "Incorrect buy-in amount");
        
        // Transfer USDC from user to contract
        // Requires user to have approved this contract
        bool success = usdc.transferFrom(msg.sender, address(this), amount);
        require(success, "Transfer failed");

        // Calculate splits
        // Shares are in 1e6 precision (e.g., 2.5% = 0.025e6 = 25,000; 100% = 1e6)
        uint256 rakeAmount = (amount * world.rakeShare) / 1e6;
        uint256 worldAmount = (amount * world.worldShare) / 1e6;
        uint256 spawnAmount = amount - rakeAmount - worldAmount;

        // Send rake immediately
        if (rakeAmount > 0) {
            require(usdc.transfer(treasury, rakeAmount), "Rake transfer failed");
        }

        // Emit event for server to spawn
        // worldAmount and spawnAmount stay in the contract
        emit Deposit(msg.sender, spawnAmount, rakeAmount, worldAmount);
    }

    /// @notice Server commits the results of a round.
    /// @param roundId Unique ID for the round.
    /// @param players List of players involved.
    /// @param finalMasses List of final mass for each player.
    function endRound(
        bytes32 roundId,
        address[] calldata players,
        uint256[] calldata finalMasses
    ) external onlyServer {
        require(players.length == finalMasses.length, "Mismatched arrays");

        uint256 totalPayoutUSDC = 0;

        for (uint256 i = 0; i < players.length; i++) {
            // Conversion:
            // Payout = (Mass * 1e6) / MPD
            // This assumes MPD is "Mass per 1 full USDC"
            // Example: Mass=100, MPD=100 => Payout = 100*1e6/100 = 1e6 (1 USDC)
            uint256 payout = (finalMasses[i] * 1e6) / world.massPerDollar;
            
            if (payout > 0) {
                claimable[players[i]] += payout;
                totalPayoutUSDC += payout;
            }
        }

        // Global Solvency Check
        // Contract must hold enough for ALL pending claims (old + new)
        totalPendingClaims += totalPayoutUSDC;
        require(usdc.balanceOf(address(this)) >= totalPendingClaims, "Insolvent: Not enough funds");

        emit Round(roundId, totalPayoutUSDC);
    }

    /// @notice Users claim their winnings.
    function claim() external {
        uint256 amount = claimable[msg.sender];
        require(amount > 0, "Nothing to claim");

        claimable[msg.sender] = 0;
        totalPendingClaims -= amount;
        
        require(usdc.transfer(msg.sender, amount), "Transfer failed");

        emit Claim(msg.sender, amount);
    }

    // -- Admin --

    /// @notice Sets the server address.
    /// @param _server The new server address.
    function setServer(address _server) external onlyOwner {
        server = _server;
        emit ServerUpdated(_server);
    }

    /// @notice Sets the treasury address.
    /// @param _treasury The new treasury address.
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice Sets the world parameters.
    /// @param _world The new world parameters.
    function setWorldParams(WorldParams memory _world) external onlyOwner {
        world = _world;
        emit WorldUpdated(_world.baseBuyIn, _world.massPerDollar, _world.rakeShare, _world.worldShare);
    }
}

