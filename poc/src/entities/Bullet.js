/**
 * Bullet projectile
 * Uses tick-based lifetime
 * `value` is used as combat damage in HP units (not cents).
 */
import { CONFIG, COLORS } from '../config.js';
import { TIMER_TICKS, TICK_MS } from '../tickConfig.js';
import { state } from '../state.js';
import { createParticles } from '../systems/particles.js';

const DT = TICK_MS / 1000;

export class Bullet {
    constructor(x, y, angle, value, ownerId, spillMult, chargeRatio, ownerVx = 0, ownerVy = 0) {
        this.x = x;
        this.y = y;
        this.value = value; // In CENTS
        this.spillMult = spillMult;
        this.chargeRatio = chargeRatio;

        // Size based on charge ratio (more visible bullets)
        const baseRad = 8;  // Larger base for visibility
        this.radius = baseRad + (chargeRatio * 6);  // 8-14 radius range

        // Velocity in units per second
        // Charge affects speed: low charge = slightly slower, high charge = faster
        const baseSpeed = CONFIG.maxSpeedBase * CONFIG.bulletSpeedMult * 60; // 60 = reference fps
        const t = Math.pow(Math.min(1, Math.max(0, chargeRatio)), CONFIG.bulletSpeedCurve ?? 1);
        const speedMult = (CONFIG.bulletSpeedMinMult ?? 1) + ((CONFIG.bulletSpeedMaxMult ?? 1) - (CONFIG.bulletSpeedMinMult ?? 1)) * t;
        const speed = baseSpeed * speedMult;
        
        // Bullet base velocity
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        
        // Velocity inheritance - bullets inherit portion of shooter's velocity
        // This makes shooting while moving feel natural
        const inherit = CONFIG.bulletVelocityInherit ?? 0.5;
        this.vx += ownerVx * inherit * 60; // Scale to per-second (ownerVx is per-tick)
        this.vy += ownerVy * inherit * 60;
        
        this.ownerId = ownerId;
        
        // Tick-based lifetime
        this.lifeTicks = TIMER_TICKS.bulletLifetime;
        
        this.dead = false;
        this.scaleX = 1.5;
        this.scaleY = 0.5;

        // Interpolation
        this.prevX = x;
        this.prevY = y;
        this.renderX = x;
        this.renderY = y;
    }

    /**
     * Tick-based update (delta-time movement)
     */
    tick() {
        // Store previous position for interpolation
        this.prevX = this.x;
        this.prevY = this.y;
        
        this.x += this.vx * DT;
        this.y += this.vy * DT;
        this.lifeTicks--;

        if (this.lifeTicks <= 0) {
            this.dead = true;
            createParticles(this.x, this.y, 2, COLORS.gray, 1);
        }
    }

    /**
     * Visual update (per render frame)
     * @param {number} alpha - Interpolation factor (0-1)
     */
    updateVisuals(alpha = 1) {
        // Interpolate position
        this.renderX = this.prevX + (this.x - this.prevX) * alpha;
        this.renderY = this.prevY + (this.y - this.prevY) * alpha;
        
        this.scaleX += (1 - this.scaleX) * 0.15;
        this.scaleY += (1 - this.scaleY) * 0.15;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.renderX, this.renderY);
        const angle = Math.atan2(this.vy, this.vx);
        ctx.rotate(angle);
        ctx.scale(this.scaleX, this.scaleY);

        // Flat bullet body with black outline (diep.io style)
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.warning;
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
    }
}
