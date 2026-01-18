/**
 * Screen effects system (shake, shockwaves, hit-stop, flashes)
 */
import { state, width, height } from '../state.js';
import { COLORS, CONFIG } from '../config.js';

// ═══════════════════════════════════════════════════════════════════
// SCREEN SHAKE (FOV-aware with distance falloff)
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if a world position is within the current screen bounds
 * Returns intensity multiplier (0 = off screen, 1 = center, scaled by distance)
 */
function getScreenIntensity(worldX, worldY) {
    const cam = state.camera;
    const zoom = cam.zoom || 1;
    
    // Convert world position to screen position
    const screenX = (worldX - cam.x) * zoom + width / 2;
    const screenY = (worldY - cam.y) * zoom + height / 2;
    
    // Check if within screen bounds (with some margin)
    const margin = 100; // Extra margin outside visible area
    if (screenX < -margin || screenX > width + margin ||
        screenY < -margin || screenY > height + margin) {
        return 0; // Off screen
    }
    
    // Calculate distance from screen center (normalized 0-1)
    const centerX = width / 2;
    const centerY = height / 2;
    const maxDist = Math.hypot(width / 2 + margin, height / 2 + margin);
    const dist = Math.hypot(screenX - centerX, screenY - centerY);
    
    // Intensity falloff: 1.0 at center, lower at edges
    const intensity = 1 - (dist / maxDist) * 0.7; // Max 70% reduction at edges
    return Math.max(0.3, intensity); // Minimum 30% intensity if on screen
}

/**
 * Add screen shake with FOV awareness
 * @param {number} amount - Base shake amount
 * @param {number} worldX - World X position of event (optional)
 * @param {number} worldY - World Y position of event (optional)
 * @param {boolean} isOwn - If true, always full shake (player's own action)
 */
export function addShake(amount, worldX = null, worldY = null, isOwn = false) {
    let finalAmount = amount;
    
    // Player's own actions always full shake
    if (!isOwn && worldX !== null && worldY !== null) {
        const intensity = getScreenIntensity(worldX, worldY);
        if (intensity === 0) return; // Off screen, no shake
        // More aggressive falloff for distant events
        finalAmount = amount * intensity * intensity; // Square for steeper falloff
    }
    
    state.shakeAmount = Math.min(state.shakeAmount + finalAmount, 40);
}

// ═══════════════════════════════════════════════════════════════════
// SHOCKWAVES
// ═══════════════════════════════════════════════════════════════════
export function addShockwave(x, y, power, color = COLORS.white) {
    state.shockwaves.push({ x, y, r: 1, power, life: 1.0, color });
}

export function updateShockwaves() {
    state.shockwaves.forEach(s => {
        s.r += 5;
        s.life -= 0.05;
    });
    state.shockwaves = state.shockwaves.filter(s => s.life > 0);
}

export function drawShockwaves(ctx) {
    state.shockwaves.forEach(s => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        
        // Inner ring
        ctx.strokeStyle = s.color.replace(')', `, ${s.life})`).replace('rgb', 'rgba');
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Outer glow
        ctx.strokeStyle = s.color.replace(')', `, ${s.life * 0.3})`).replace('rgb', 'rgba');
        ctx.lineWidth = 8;
        ctx.stroke();
    });
}

// ═══════════════════════════════════════════════════════════════════
// HIT-STOP (Freeze frames on impact)
// ═══════════════════════════════════════════════════════════════════
let hitStopFrames = 0;
let hitStopCallback = null;

export function triggerHitStop(frames, callback = null) {
    hitStopFrames = frames;
    hitStopCallback = callback;
}

export function isHitStopped() {
    return hitStopFrames > 0;
}

export function updateHitStop() {
    if (hitStopFrames > 0) {
        hitStopFrames--;
        if (hitStopFrames === 0 && hitStopCallback) {
            hitStopCallback();
            hitStopCallback = null;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN FLASH (Damage indicator)
// ═══════════════════════════════════════════════════════════════════
export function flashDamage(intensity = 1.0) {
    const el = document.getElementById('damage-flash');
    const alpha = Math.min(0.6, 0.3 * intensity);
    el.style.boxShadow = `inset 0 0 80px 40px rgba(244, 63, 94, ${alpha})`;
    el.style.background = `radial-gradient(circle at center, transparent 40%, rgba(244, 63, 94, ${alpha * 0.5}) 100%)`;
    
    setTimeout(() => {
        el.style.boxShadow = 'inset 0 0 0 0px rgba(255, 0, 0, 0)';
        el.style.background = 'transparent';
    }, 150);
}

export function flashGain() {
    const el = document.getElementById('damage-flash');
    el.style.boxShadow = `inset 0 0 60px 30px rgba(74, 222, 128, 0.2)`;
    
    setTimeout(() => {
        el.style.boxShadow = 'inset 0 0 0 0px rgba(0, 0, 0, 0)';
    }, 100);
}

// ═══════════════════════════════════════════════════════════════════
// ENTITY FLASH (Visual feedback on entities)
// ═══════════════════════════════════════════════════════════════════
export function flashEntity(entity, color = COLORS.danger, duration = CONFIG.entityFlashDuration) {
    entity.flashColor = color;
    entity.flashTimer = duration;
}

// ═══════════════════════════════════════════════════════════════════
// BALANCE DELTA (Floating +/- next to HUD)
// ═══════════════════════════════════════════════════════════════════
let deltaTimeout = null;

export function showBalanceDelta(amount, isGain) {
    const deltaEl = document.getElementById('balance-delta');
    if (!deltaEl) return;
    
    // Clear existing timeout
    if (deltaTimeout) clearTimeout(deltaTimeout);
    
    // Set content and color
    const sign = isGain ? '+' : '-';
    deltaEl.innerText = `${sign}$${(Math.abs(amount) / 100).toFixed(2)}`;
    deltaEl.className = isGain ? 'delta-gain' : 'delta-loss';
    deltaEl.style.opacity = '1';
    deltaEl.style.transform = 'translateY(0)';
    
    // Flash the main balance
    const hud = document.getElementById('hud-balance');
    hud.classList.remove('flash-gain', 'flash-loss');
    void hud.offsetWidth; // Force reflow
    hud.classList.add(isGain ? 'flash-gain' : 'flash-loss');
    
    // Fade out
    deltaTimeout = setTimeout(() => {
        deltaEl.style.opacity = '0';
        deltaEl.style.transform = 'translateY(-10px)';
        hud.classList.remove('flash-gain', 'flash-loss');
    }, 800);
}
