/**
 * Rendering system
 * Displays values in dollars (converts from cents)
 */
import { state, ctx, width, height, getPlayer, input } from './state.js';
import { CONFIG, COLORS, formatMoney } from './config.js';
import { TIMER_TICKS } from './tickConfig.js';
import { getCurrentTick } from './simulation.js';
import { drawParticles } from './systems/particles.js';
import { drawShockwaves } from './systems/effects.js';

export function drawGrid() {
    // Clean dark grid (diep.io style - subtle)
    ctx.strokeStyle = '#252530';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();

    const sz = 100;
    const l = Math.floor((state.camera.x - width / 2) / sz) * sz;
    const t = Math.floor((state.camera.y - height / 2) / sz) * sz;

    for (let x = l; x < l + width + sz; x += sz) {
        ctx.moveTo(x, t - sz);
        ctx.lineTo(x, t + height + sz);
    }
    for (let y = t; y < t + height + sz; y += sz) {
        ctx.moveTo(l - sz, y);
        ctx.lineTo(l + width + sz, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // World boundary - Clean solid line (no glow)
    ctx.strokeStyle = COLORS.danger;
    ctx.lineWidth = 5;
    const br = state.borderRadius ?? (CONFIG.worldSize / 2);
    ctx.beginPath();
    ctx.arc(0, 0, br, 0, Math.PI * 2);
    ctx.stroke();
}

function drawDecorations() {
    if (!Array.isArray(state.decoShapes) || state.decoShapes.length === 0) return;
    const time = Date.now() * 0.001;
    for (const s of state.decoShapes) {
        const a = (s.angle ?? 0) + time * (s.spin ?? 0);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(a);
        ctx.beginPath();
        if (s.shape === 'circle') {
            ctx.arc(0, 0, s.size, 0, Math.PI * 2);
        } else if (s.shape === 'square') {
            ctx.rect(-(s.w / 2), -(s.h / 2), s.w, s.h);
        } else {
            // Regular polygon
            const rr = s.size * 0.95;
            for (let i = 0; i < s.sides; i++) {
                const t = (i / s.sides) * Math.PI * 2;
                const px = Math.cos(t) * rr;
                const py = Math.sin(t) * rr;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
        }
        ctx.fillStyle = s.color;
        ctx.fill();
        ctx.strokeStyle = s.outline;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }
}

function drawOutOfBoundsOverlay() {
    const br = state.borderRadius ?? (CONFIG.worldSize / 2);
    const maxR = (CONFIG.worldRadiusMax ?? (CONFIG.worldSize / 2)) + 2000;

    // Clip to outside the border circle, then fill with a transparent red overlay
    ctx.save();
    ctx.beginPath();
    ctx.rect(-maxR, -maxR, maxR * 2, maxR * 2);
    ctx.arc(0, 0, br, 0, Math.PI * 2, true);
    ctx.clip('evenodd');

    // Slight radial falloff looks nicer than a flat tint
    const g = ctx.createRadialGradient(0, 0, br, 0, 0, maxR);
    g.addColorStop(0, 'rgba(251, 113, 133, 0.00)');
    g.addColorStop(0.15, COLORS.dangerOverlay);
    g.addColorStop(1, 'rgba(251, 113, 133, 0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(-maxR, -maxR, maxR * 2, maxR * 2);

    ctx.restore();
}

let noisePattern = null;
function getNoisePattern() {
    if (noisePattern) return noisePattern;
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const nctx = c.getContext('2d');
    const img = nctx.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.floor(Math.random() * 255);
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = Math.random() < 0.15 ? 12 : 0; // sparse subtle noise
    }
    nctx.putImageData(img, 0, 0);
    noisePattern = ctx.createPattern(c, 'repeat');
    return noisePattern;
}

function drawBackgroundTexture() {
    // Removed - using clean grid only (diep.io style)
}

export function drawStars() {
    // Removed - too cluttered
}

export function drawEntity(e, alpha = 1) {
    // Update visuals with interpolation
    e.updateVisuals(alpha);
    
    // Use interpolated render position
    let rx = e.renderX;
    let ry = e.renderY;
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(e.radius)) return;
    
    // === HIT SHAKE (entity-local jitter when flashing) ===
    if ((e.flashTimer > 0 || e.hitFlashTimer > 0) && (e.type === 'player' || e.type === 'bot')) {
        // Deterministic jitter based on entity id and time
        const shakeIntensity = 4; // pixels
        const t = Date.now() * 0.03 + e.id * 1000;
        rx += Math.sin(t * 7) * shakeIntensity;
        ry += Math.cos(t * 11) * shakeIntensity;
    }
    
    // Fading trail effect - velocity-based, prominent during dashes
    const speed = Math.hypot(e.vx, e.vy);
    if (e.type === 'player' || e.type === 'bot') {
        // More trail steps at higher speeds (cap lower to reduce render spikes)
        const trailSteps = Math.min(6, 3 + Math.floor(speed / 3));
        
        // Trail length scales strongly with velocity - MUCH LONGER
        const baseLength = 20;
        const velocityLength = speed * 5; // Reduced (perf + less visual smear)
        const trailLength = baseLength + velocityLength;
        
        // Get direction (use last movement if stationary)
        let angle = Math.atan2(e.vy, e.vx);
        if (speed < 0.1) angle = e.lastMoveAngle || 0;
        else e.lastMoveAngle = angle;
        
        for (let i = 0; i < trailSteps; i++) {
            const t = (i + 1) / (trailSteps + 1);
            const dist = trailLength * t;
            const tx = rx - Math.cos(angle) * dist;
            const ty = ry - Math.sin(angle) * dist;
            
            // Alpha strongly tied to speed - very visible during dashes
            const speedFactor = Math.min(1, speed / 8);
            const trailAlpha = (1 - t) * (0.12 + speedFactor * 0.35); // Lower alpha
            const trailRadius = e.radius * (1 - t * 0.4); // Less size reduction
            
            ctx.beginPath();
            ctx.arc(tx, ty, trailRadius, 0, Math.PI * 2);
            ctx.fillStyle = e.avatarColor || COLORS.white;
            ctx.globalAlpha = trailAlpha;
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
    }

    ctx.save();
    ctx.translate(rx, ry);
    
    // Rotate to movement direction for squash/stretch
    const moveAngle = Math.atan2(e.vy, e.vx);
    if (Math.hypot(e.vx, e.vy) > 0.1) ctx.rotate(moveAngle);
    ctx.scale(e.scaleX, e.scaleY);

    // Get entity color
    let color = e.getColor();

    // === FOOD / SPILL RENDERING (flat, no glow) ===
    if (e.type === 'food' || e.type === 'spill') {
        // Check if locked for the player (dimmed if can't collect)
        const player = getPlayer();
        const isLocked = player && e.isLockedFor(player.id);
        
        // Unlock pop animation - scale up briefly then back to normal
        let popScale = 1;
        if (e.unlockPopTimer > 0) {
            const popProgress = e.unlockPopTimer / 8; // 8 ticks total
            popScale = 1 + Math.sin(popProgress * Math.PI) * 0.4; // Smooth pop
        }
        
        // Apply dimming for locked spills
        ctx.globalAlpha = isLocked ? 0.4 : 1.0;
        
        // Flat circle with thin black outline (diep.io style)
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * popScale, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.globalAlpha = 1.0;
        ctx.restore();
        
        // Money text above (no rotation) - BIGGER for visibility
        ctx.save();
        ctx.translate(rx, ry);
        ctx.globalAlpha = isLocked ? 0.4 : 1.0;
        // Bold green text - much larger
        ctx.fillStyle = COLORS.primary;
        const fSize = Math.max(16, e.radius * 1.4); // Bigger text
        ctx.font = `900 ${fSize}px 'Rubik', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Always show value (bigger = more visible)
        ctx.strokeStyle = 'rgba(0,0,0,0.95)';
        ctx.lineWidth = 4;
        ctx.strokeText(formatMoney(e.balance), 0, -e.radius - 12);
        ctx.fillText(formatMoney(e.balance), 0, -e.radius - 12);
        
        ctx.globalAlpha = 1.0;
        ctx.restore();
        return;
    }

    // === PLAYER / BOT RENDERING (flat, bold outline - diep.io style) ===
    const fillColor = e.avatarColor || color;
    
    // Reset transform for barrel (undo movement rotation)
    ctx.restore();
    
    // Gun barrel (drawn behind body, pointing toward mouse/aim direction)
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(e.aimAngle || 0);
    
    const barrelWidth = e.radius * 0.5;
    const barrelLength = e.radius * 1.1;
    const barrelOffset = e.radius * 0.15;
    
    // Barrel (diep.io style - gray with dark outline)
    ctx.fillStyle = '#888';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.roundRect(barrelOffset, -barrelWidth / 2, barrelLength, barrelWidth, 4);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Main body (on top of barrel - diep.io uses darker shade of fill for outline)
    ctx.save();
    ctx.translate(rx, ry);
    ctx.beginPath();
    ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    // Darker outline (approximate by using semi-transparent black)
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 7;
    ctx.stroke();

    // Dash charging effect - IMPROVED with pulse
    if (e.isChargingDash) {
        const chargeTicks = getCurrentTick() - e.dashChargeStartTick;
        const ratio = Math.min(1, chargeTicks / TIMER_TICKS.dashOverheat);
        
        // Pulsing scale effect (entity grows slightly while charging)
        const pulseFreq = 8 + ratio * 12; // Faster pulse as charge increases
        const pulseAmp = 0.03 + ratio * 0.05; // Stronger pulse at high charge
        const pulse = 1 + Math.sin(Date.now() * 0.01 * pulseFreq) * pulseAmp;
        
        // Pulsing glow ring
        const glowRadius = e.radius * pulse + 4;
        ctx.beginPath();
        ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
        ctx.strokeStyle = ratio > 0.8 ? COLORS.danger : COLORS.warning;
        ctx.lineWidth = 3 + ratio * 3;
        ctx.globalAlpha = 0.4 + ratio * 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
        
        // Charge arc (thicker, more prominent)
        ctx.beginPath();
        ctx.arc(0, 0, e.radius + 8, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * ratio));
        ctx.strokeStyle = ratio > 0.9 ? COLORS.danger : COLORS.white;
        ctx.lineWidth = 4 + ratio * 2;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
    }
    
    // Dash active effect
    if (e.dashActiveTimer > 0) {
        ctx.strokeStyle = COLORS.white;
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    // Flash overlay on hit (over body)
    if (e.flashTimer > 0 && e.flashColor) {
        const flashAlpha = Math.min(0.6, e.flashTimer / 100);
        ctx.fillStyle = e.flashColor;
        ctx.globalAlpha = flashAlpha;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    
    // Post-damage tint (visible while slowed - subtle red overlay on body)
    if (e.slowTimer > 0 && (e.type === 'player' || e.type === 'bot')) {
        const slowAlpha = Math.min(0.25, (e.slowTimer / 30) * 0.25);
        ctx.fillStyle = COLORS.danger;
        ctx.globalAlpha = slowAlpha;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    ctx.restore();

    // === UI OVERLAY (no rotation) ===
    ctx.save();
    ctx.translate(rx, ry);

    // Stun visual
    if (e.stunTimer > 0) {
        const time = Date.now() * 0.005;
        ctx.fillStyle = COLORS.warning;
        for (let i = 0; i < 3; i++) {
            const angle = time + (i * (Math.PI * 2 / 3));
            const sx = Math.cos(angle) * e.radius * 1.3;
            const sy = Math.sin(angle) * e.radius * 1.3;
            ctx.beginPath();
            ctx.arc(sx, sy, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Exit progress ring
    if (e.isExiting && e.exitProgress > 0) {
        const progress = e.exitProgress / CONFIG.exitDurationTicks;
        const ringRadius = e.radius + 8;
        
        // Background ring
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = COLORS.grayDark;
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Progress ring
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * progress));
        ctx.strokeStyle = COLORS.primary;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
    }

    // Aim indicator
    ctx.save();
    ctx.rotate(e.aimAngle);
    ctx.beginPath();
    ctx.moveTo(e.radius + 4, 0);
    ctx.lineTo(e.radius + 12, 0);
    ctx.strokeStyle = COLORS.white;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    // Hit direction indicator (player only): helps explain "instant" close-range deaths
    if (e.type === 'player' && e.hitIndicatorTimer > 0 && e.lastHitAngle !== null) {
        const t = e.hitIndicatorTimer / 12;
        ctx.save();
        ctx.rotate(e.lastHitAngle);
        ctx.globalAlpha = 0.25 + 0.55 * t;
        ctx.strokeStyle = COLORS.danger;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(e.radius + 10, 0);
        ctx.lineTo(e.radius + 28, 0);
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    // Charge indicator (shooting) - IMPROVED with pulse
    if ((e.isChargingShot && e.shootChargeRatio > 0) || (e.shootChargeVisualTicks > 0 && e.shootChargeRatio > 0)) {
        const ratio = Math.max(0, Math.min(1, e.shootChargeRatio));
        const isActive = e.isChargingShot;
        const a = isActive ? 1 : Math.max(0.15, e.shootChargeVisualTicks / 10);
        
        // Subtle pulsing glow while actively charging
        if (isActive && ratio > 0.1) {
            const pulseFreq = 6 + ratio * 10;
            const pulseAmp = 0.02 + ratio * 0.04;
            const pulse = 1 + Math.sin(Date.now() * 0.01 * pulseFreq) * pulseAmp;
            
            ctx.beginPath();
            ctx.arc(0, 0, e.radius * pulse + 3, 0, Math.PI * 2);
            ctx.strokeStyle = COLORS.primary;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.3 * ratio * a;
            ctx.stroke();
        }
        
        // Charge arc (thicker at high charge)
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius + 8, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * ratio));
        ctx.strokeStyle = ratio > 0.9 ? COLORS.danger : COLORS.primary;
        ctx.lineWidth = 3 + ratio * 2;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.globalAlpha = 1;
    }

    const visualRadius = e.radius * Math.max(1, e.scaleX || 1, e.scaleY || 1);

    // Health bar BELOW entity (red, diep.io style) - only show when damaged
    if ((e.type === 'player' || e.type === 'bot') && typeof e.hp === 'number' && typeof e.maxHp === 'number' && e.maxHp > 0 && e.hp < e.maxHp) {
        const pct = Math.max(0, Math.min(1, e.hp / e.maxHp));
        const barW = Math.max(50, e.radius * 1.4);
        const barH = 5;
        const y = visualRadius + 10;

        ctx.save();
        ctx.translate(0, y);
        
        // Background bar (dark gray with black outline)
        ctx.fillStyle = '#333';
        ctx.fillRect(-barW / 2, -barH / 2, barW, barH);
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.strokeRect(-barW / 2, -barH / 2, barW, barH);

        // Fill (red)
        const fillW = (barW - 2) * pct;
        ctx.fillStyle = '#fb7185';
        ctx.fillRect(-barW / 2 + 1, -barH / 2 + 1, fillW, barH - 2);
        ctx.restore();
    }

    // Name label (INSIDE the body)
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'center';
    const nameSize = Math.max(11, Math.min(14, e.radius * 0.35));
    ctx.font = `700 ${nameSize}px "Rubik", sans-serif`;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2.5;
    ctx.strokeText(e.name, 0, 5);
    ctx.fillText(e.name, 0, 5);

    // Balance (in dollars) - BIGGER, prominent
    const balanceY = -visualRadius - 22;
    const balanceText = formatMoney(e.balance);
    
    // Measure balance text width for delta positioning
    ctx.font = '900 22px "Rubik", sans-serif';
    const balanceWidth = ctx.measureText(balanceText).width;
    
    // Determine balance text color
    let balanceColor = COLORS.primary;
    let balanceScale = 1;
    
    if (e.balanceFlashTimer > 0) {
        const flashRatio = e.balanceFlashTimer / 300;
        balanceScale = 1 + flashRatio * 0.15;
        
        if (e.balanceDelta > 0) {
            balanceColor = COLORS.white; // Flash white on gain
        } else {
            balanceColor = COLORS.danger; // Flash red on loss
        }
    }
    
    ctx.save();
    ctx.translate(0, balanceY);
    ctx.scale(balanceScale, balanceScale);
    
    ctx.font = '900 22px "Rubik", sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = 4;
    ctx.fillStyle = balanceColor;
    ctx.strokeText(balanceText, 0, 0);
    ctx.fillText(balanceText, 0, 0);
    
    ctx.restore();
    
    // Draw delta next to balance
    if (e.balanceDeltaTimer > 0 && e.balanceDelta !== 0) {
        const isGain = e.balanceDelta > 0;
        const deltaText = (isGain ? '+' : '') + formatMoney(Math.abs(e.balanceDelta));
        const deltaAlpha = Math.min(1, e.balanceDeltaTimer / 400);
        const slideUp = (1 - deltaAlpha) * 8;
        
        ctx.save();
        ctx.translate(balanceWidth / 2 + 8, balanceY - slideUp);
        ctx.globalAlpha = deltaAlpha;
        
        ctx.font = '800 18px "Rubik", sans-serif';
        ctx.textAlign = 'left';
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.lineWidth = 4;
        ctx.fillStyle = isGain ? COLORS.primary : COLORS.danger;
        
        ctx.strokeText(deltaText, 0, 0);
        ctx.fillText(deltaText, 0, 0);
        
        ctx.restore();
    }

    ctx.restore();
}

export function drawAimLine(player) {
    if (player.stunTimer > 0) return;

    const px = player.renderX;
    const py = player.renderY;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 20]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(
        px + Math.cos(player.aimAngle) * 1000,
        py + Math.sin(player.aimAngle) * 1000
    );
    ctx.stroke();
    ctx.setLineDash([]);
}

export function render(shakeX, shakeY, alpha = 1) {
    // Clear with background color
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    if (state.gameState === 'dead') return;

    drawBackgroundTexture();

    // World transform
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(state.camera.zoom, state.camera.zoom);
    ctx.translate(-state.camera.x + shakeX, -state.camera.y + shakeY);

    drawGrid();
    drawDecorations();

    // Obstacles
    state.obstacles.forEach(o => o.draw(ctx));

    drawShockwaves(ctx);
    drawParticles(ctx);

    // Food/Spill entities
    state.entities.forEach(e => {
        if (e.type !== 'player' && e.type !== 'bot') drawEntity(e, alpha);
    });

    // Bullets
    state.bullets.forEach(b => {
        b.updateVisuals(alpha);
        b.draw(ctx);
    });

    // Players/Bots (draw last so they're on top)
    state.entities.forEach(e => {
        if (e.type === 'player' || e.type === 'bot') drawEntity(e, alpha);
    });

    // Aim line
    const player = getPlayer();
    if (player && !player.dead) {
        drawAimLine(player);
    }

    // Floating texts
    state.floatTexts.forEach(f => f.draw(ctx));

    // Outside-of-border overlay (draw last, so it tints everything out of bounds)
    drawOutOfBoundsOverlay();

    ctx.restore();
}
