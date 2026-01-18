/**
 * Input handling system
 */
import { input, getPlayer } from './state.js';
import { Audio } from './audio.js';
import { CONFIG } from './config.js';

export function setupInput() {
    window.addEventListener('mousemove', (e) => {
        input.mouse.x = e.clientX;
        input.mouse.y = e.clientY;
    });

    window.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            input.lmb = true;
            input.lmbStart = Date.now();
            Audio.init();
        }
        if (e.button === 2) {
            input.rmb = true;
            Audio.init();
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            input.lmb = false;
            const p = getPlayer();
            if (p && !p.dead) {
                const holdTime = Math.min(Date.now() - input.lmbStart, CONFIG.shootChargeTimeMs);
                const ratio = holdTime / CONFIG.shootChargeTimeMs;
                p.shoot(p.aimAngle, Math.max(0.15, ratio));
            }
        }
        if (e.button === 2) {
            input.rmb = false;
        }
    });

    window.addEventListener('keydown', (e) => {
        const code = e.code;
        if (code === 'KeyW') input.keys.w = true;
        if (code === 'KeyA') input.keys.a = true;
        if (code === 'KeyS') input.keys.s = true;
        if (code === 'KeyD') input.keys.d = true;
        if (code === 'KeyQ') input.keys.q = true;
        if (code === 'Space') {
            input.keys.space = true;
            Audio.init();
        }
    });

    window.addEventListener('keyup', (e) => {
        const code = e.code;
        if (code === 'KeyW') input.keys.w = false;
        if (code === 'KeyA') input.keys.a = false;
        if (code === 'KeyS') input.keys.s = false;
        if (code === 'KeyD') input.keys.d = false;
        if (code === 'KeyQ') input.keys.q = false;
        if (code === 'Space') input.keys.space = false;
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
}
