/**
 * Ballistic Capital v9.5 - Tactical Dash PoC
 * Main entry point
 * 
 * Game Flow:
 * 1. LOBBY - See wallet, choose to enter
 * 2. PLAYING - In-game action
 * 3. EXIT_SUCCESS - Cashed out successfully
 * 4. DEAD - Liquidated, lost everything
 */
import { CONFIG, formatMoney } from './config.js';
import { TICK_RATE } from './tickConfig.js';
import { state, input, setCanvas, setDimensions, getPlayer, resetState } from './state.js';
import { setupInput } from './input.js';
import { Entity } from './entities/Entity.js';
import { spawnObstacles, spawnDecorations, ensurePellets } from './spawners.js';
import { update, resetSimulation, getSimulationStats } from './simulation.js';
import { render } from './renderer.js';
import { updateLeaderboard, updateHUD, updateReserveDisplay } from './ui.js';
import { updateParticles } from './systems/particles.js';
import { getWalletBalance, deposit, withdraw, resetWallet, formatWalletBalance } from './wallet.js';

// Game phases
let gamePhase = 'lobby'; // 'lobby', 'playing', 'exit_success', 'dead'

// Initialize canvas
function initCanvas() {
    const canvasEl = document.getElementById('gameCanvas');
    setCanvas(canvasEl);
    resize();
    window.addEventListener('resize', resize);
}

function resize() {
    const canvasEl = document.getElementById('gameCanvas');
    canvasEl.width = window.innerWidth;
    canvasEl.height = window.innerHeight;
    setDimensions(window.innerWidth, window.innerHeight);
}

// Initialize starfield
function initStars() {
    for (let i = 0; i < 300; i++) {
        state.stars.push({
            x: Math.random() * CONFIG.worldSize * 2 - CONFIG.worldSize,
            y: Math.random() * CONFIG.worldSize * 2 - CONFIG.worldSize,
            size: Math.random() * 3,
            alpha: Math.random()
        });
    }
}

// Update lobby UI
function updateLobbyUI() {
    const walletBalance = getWalletBalance();
    document.getElementById('wallet-balance').innerText = formatWalletBalance();
    document.getElementById('entry-fee').innerText = formatMoney(CONFIG.entryFee);
    
    const enterBtn = document.getElementById('enter-btn');
    const insufficientMsg = document.getElementById('insufficient-funds');
    
    if (walletBalance >= CONFIG.entryFee) {
        enterBtn.disabled = false;
        insufficientMsg.style.display = 'none';
    } else {
        enterBtn.disabled = true;
        insufficientMsg.style.display = 'block';
        insufficientMsg.innerText = `Insufficient funds! Need ${formatMoney(CONFIG.entryFee)} to enter.`;
    }
}

// Show lobby screen
function showLobby() {
    gamePhase = 'lobby';
    document.getElementById('lobby').style.display = 'flex';
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('exit-success').style.display = 'none';
    document.getElementById('ui-layer').style.display = 'none';
    updateLobbyUI();
}

// Enter the game (deposit and start)
function enterGame() {
    if (!deposit(CONFIG.entryFee)) {
        console.error('Failed to deposit - insufficient funds');
        return;
    }
    
    // Hide lobby, show game UI
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('ui-layer').style.display = 'block';
    
    // Start the game
    startGame();
    gamePhase = 'playing';
    
    // Fade controls hint after 10 seconds
    setTimeout(() => {
        const hint = document.getElementById('controls-hint');
        if (hint) hint.classList.add('faded');
    }, 10000);
    
    console.log(`Entered game - Deposited ${formatMoney(CONFIG.entryFee)}`);
}

// Start a new game (internal)
function startGame() {
    resetState();
    resetSimulation();

    document.getElementById('game-over').style.display = 'none';
    document.getElementById('transaction-log').innerHTML = '';
    document.getElementById('status-msg').style.display = 'none';

    // Spawn player with entry fee as starting balance
    state.entities.push(new Entity(0, 0, CONFIG.entryFee, 'player'));

    // Spawn obstacles
    spawnObstacles();
    spawnDecorations();

    // Queue bot spawns (tick-based pacing handled by simulation)
    const botCount = Math.max(0, (CONFIG.maxEntities ?? 1) - 1);
    state.botSpawnQueue = [];
    for (let i = 0; i < botCount; i++) {
        state.botSpawnQueue.push(0); // dueTick=0, pacing happens in simulation
    }

    // Spawn initial pellets
    ensurePellets({ force: true });
    
    console.log(`Game started - Tick rate: ${TICK_RATE}/sec`);
}

// Handle successful exit
function handleExitSuccess(player) {
    const cashout = player.balance;
    
    // Add to wallet (only for player)
    if (player.type === 'player') {
        withdraw(cashout);
        
        // Show exit success screen
        document.getElementById('exit-success').style.display = 'block';
        document.getElementById('exit-amount').innerText = '+' + formatMoney(cashout);
        document.getElementById('ui-layer').style.display = 'none';
        
        gamePhase = 'exit_success';
        console.log(`Player Exited successfully - Withdrew ${formatMoney(cashout)}`);
    } else if (player.type === 'bot') {
        // Bot exit logic
        console.log(`Bot ${player.id} exited with ${formatMoney(cashout)}`);
        // Schedule respawn (handled by entity die -> respawn logic usually, 
        // but here we need to manually trigger it since "die" implies death-by-damage)
        
        // Treat bot exit like a death but without the shockwave/particles
        player.dead = true;
        
        // Queue respawn
        if (Array.isArray(state.botSpawnQueue)) {
             state.botSpawnQueue.push(getCurrentTick() + (CONFIG.botRespawnDelayTicks ?? 40));
        }
    }
    
    // Clear entity
    player.dead = true;
}

// Handle player death (override ui.js triggerGameOver)
function handlePlayerDeath() {
    gamePhase = 'dead';
    document.getElementById('game-over').style.display = 'block';

    // Death recap (helps explain instant close-range shots / burn deaths)
    const player = getPlayer();
    const msg = document.getElementById('go-message');
    if (player && msg) {
        if (player.lastDeathCause === 'burn') {
            msg.innerText = 'BURNED OUT (time cost drained you).';
        } else if (player.lastHitSourceId) {
            const killer = state.entities.find(e => e.id === player.lastHitSourceId);
            const killerName = killer ? killer.name : 'UNKNOWN';
            msg.innerText = `ELIMINATED BY ${killerName} (${formatMoney(player.lastHitAmount)})`;
        } else {
            msg.innerText = 'LIQUIDATED.';
        }
    }
    
    // Update button text based on wallet balance
    const restartBtn = document.getElementById('restart-btn');
    if (getWalletBalance() >= CONFIG.entryFee) {
        restartBtn.innerText = `Re-Invest (${formatMoney(CONFIG.entryFee)})`;
        restartBtn.disabled = false;
    } else {
        restartBtn.innerText = 'Insufficient Funds';
        restartBtn.disabled = true;
    }
}

// Main game loop (requestAnimationFrame)
function loop(currentTime) {
    requestAnimationFrame(loop);
    
    // Only run simulation when playing
    if (gamePhase !== 'playing') {
        return;
    }

    // Run fixed timestep simulation
    const alpha = update(currentTime);

    // Check for exit completion
    const player = getPlayer();
    if (player && player.exitComplete) {
        handleExitSuccess(player);
        return;
    }
    
    // Check for death
    if (player && player.dead && gamePhase === 'playing') {
        handlePlayerDeath();
        return;
    }

    // Screen shake
    let rx = 0, ry = 0;
    if (state.shakeAmount > 0) {
        rx = (Math.random() - 0.5) * state.shakeAmount;
        ry = (Math.random() - 0.5) * state.shakeAmount;
        state.shakeAmount *= 0.9;
        if (state.shakeAmount < 0.5) state.shakeAmount = 0;
    }

    // Update camera (client-side, can run every frame)
    if (player && !player.dead) {
        // Interpolate player position for smooth camera
        player.updateVisuals(alpha);
        
        // Dynamic zoom
        const speed = Math.hypot(player.vx, player.vy);
        const maxSpeedRef = 15;
        const speedRatio = Math.min(1, speed / maxSpeedRef);
        const targetZoom = CONFIG.zoomBase - (speedRatio * (CONFIG.zoomBase - CONFIG.zoomMin));
        state.camera.zoom += (targetZoom - state.camera.zoom) * 0.05;

        // Camera follow (tighter centering, reduced look-ahead)
        let targetCamX = player.renderX + Math.cos(player.aimAngle) * 60;  // Reduced look-ahead
        let targetCamY = player.renderY + Math.sin(player.aimAngle) * 60;
        state.camera.x += (targetCamX - state.camera.x) * 0.15;  // Faster follow
        state.camera.y += (targetCamY - state.camera.y) * 0.15;

        // Update HUD
        updateHUD(player);
    }

    // Update reserve display
    updateReserveDisplay();

    // Update particles (decrement life, apply physics)
    updateParticles();

    // Render with interpolation alpha
    render(rx, ry, alpha);

    // Leaderboard
    updateLeaderboard();
}

// Initialize
function init() {
    initCanvas();
    initStars();
    setupInput();

    // Lobby buttons
    document.getElementById('enter-btn').addEventListener('click', enterGame);
    document.getElementById('reset-wallet-btn').addEventListener('click', () => {
        resetWallet();
        updateLobbyUI();
    });
    
    // Game over restart button
    document.getElementById('restart-btn').addEventListener('click', () => {
        if (getWalletBalance() >= CONFIG.entryFee) {
            document.getElementById('game-over').style.display = 'none';
            enterGame();
        }
    });
    
    // Exit success continue button
    document.getElementById('exit-continue-btn').addEventListener('click', () => {
        showLobby();
    });

    // Debug: expose simulation stats
    window.getSimStats = getSimulationStats;
    window.getWallet = getWalletBalance;

    // Start at lobby
    showLobby();
    requestAnimationFrame(loop);
}

init();
