/**
 * Simple particle system
 * Particles are circles that fade out
 */
import { state } from '../state.js';
import { CONFIG } from '../config.js';

export function createParticles(x, y, count, color, speedVal) {
    // Cap particle count to prevent spam
    const actualCount = Math.min(count, CONFIG.particlesPerEvent || 8);
    
    for (let i = 0; i < actualCount; i++) {
        const speed = speedVal || 3;
        const angle = Math.random() * Math.PI * 2;
        state.particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed * (0.5 + Math.random() * 0.5),
            vy: Math.sin(angle) * speed * (0.5 + Math.random() * 0.5),
            life: 20 + Math.random() * 15,
            maxLife: 35,
            color: color,
            size: 3 + Math.random() * 3
        });
    }
}

export function updateParticles() {
    state.particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.92; // Friction
        p.vy *= 0.92;
        p.life--;
    });
    state.particles = state.particles.filter(p => p.life > 0);
}

export function drawParticles(ctx) {
    state.particles.forEach(p => {
        const alpha = Math.min(1, p.life / 15);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
}
