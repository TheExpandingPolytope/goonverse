/**
 * UI update functions
 * Displays values in dollars (converts from cents)
 */
import { state, getPlayer } from './state.js';
import { CONFIG, formatMoney, formatMoneyValue } from './config.js';

/**
 * Log a transaction to the feed
 * @param {number} amount - Amount in CENTS
 * @param {string} type - 'gain' or 'loss'
 */
export function logTransaction(amount, type) {
    const log = document.getElementById('transaction-log');
    const item = document.createElement('div');
    item.className = `log-item ${type === 'gain' ? 'log-gain' : 'log-loss'}`;
    item.innerText = `${type === 'gain' ? '+' : '-'}${formatMoney(amount)}`;
    log.appendChild(item);

    setTimeout(() => {
        item.style.opacity = 0;
        item.style.transform = 'translateX(20px)';
        setTimeout(() => item.remove(), 200);
    }, 2000);

    if (log.children.length > 5) {
        log.removeChild(log.firstChild);
    }
}

/**
 * Log a world event to the event feed
 * @param {string} message
 * @param {'exit'|'warn'|'danger'} variant
 */
export function logEvent(message, variant = 'warn') {
    const feed = document.getElementById('event-feed');
    if (!feed) return;

    const item = document.createElement('div');
    item.className = `event-item event-${variant}`;
    item.innerText = message;
    feed.appendChild(item);

    setTimeout(() => {
        item.style.opacity = 0;
        item.style.transform = 'translateX(20px)';
        setTimeout(() => item.remove(), 200);
    }, 4000);  // Longer display time

    if (feed.children.length > 6) {
        feed.removeChild(feed.firstChild);
    }
}

/**
 * Update leaderboard display
 */
export function updateLeaderboard() {
    const sorted = state.entities
        .filter(e => e.type === 'player' || e.type === 'bot')
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5);

    document.getElementById('lb-content').innerHTML = sorted.map((e, i) => `
        <div class="lb-entry" style="color:${e.type === 'player' ? '#4ade80' : '#ccc'}">
            <span>#${i + 1} ${e.type === 'player' ? 'YOU' : 'Bot-' + e.id.toFixed(3).substr(2, 3)}</span>
            <span>${formatMoney(e.balance)}</span>
        </div>`).join('');
}

/**
 * Update main HUD display
 * @param {Entity} player - Player entity
 */
export function updateHUD(player) {
    const cashEl = document.getElementById('player-cash');
    cashEl.innerText = formatMoneyValue(player.balance);

    // PnL calculation
    const pnlCents = player.balance - CONFIG.startBalance;
    const pct = (pnlCents / CONFIG.startBalance) * 100;
    
    const badge = document.getElementById('pnl-badge');
    const sign = pnlCents >= 0 ? '+' : '';
    badge.innerText = `(${sign}${pct.toFixed(0)}%)`;

    badge.className = '';
    if (Math.abs(pct) < 1) badge.classList.add('badge-neutral');
    else if (pct > 0) badge.classList.add('badge-plus');
    else badge.classList.add('badge-minus');
}

/**
 * Update reserve display (DEPRECATED - HIDDEN)
 */
export function updateReserveDisplay() {
    // Hidden
}

/**
 * Trigger game over screen
 * 
 */
export function triggerGameOver() {
    state.gameState = 'dead';
    document.getElementById('game-over').style.display = 'block';
}
