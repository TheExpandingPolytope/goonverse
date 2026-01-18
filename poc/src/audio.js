/**
 * Audio system using Web Audio API
 * Supports distance-based falloff for spatial audio
 */
import { getPlayer } from './state.js';

class AudioSystem {
    constructor() {
        this.ctx = null;
        this.falloffDistance = 400; // Distance at which sound is 50% volume
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            document.getElementById('audio-hint').style.display = 'none';
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Calculate volume multiplier based on distance from player
     * @param {number} x - World X position of sound
     * @param {number} y - World Y position of sound
     * @param {boolean} isOwn - If true, always returns 1 (player's own sounds)
     * @returns {number} Volume multiplier 0-1
     */
    getVolumeForDistance(x, y, isOwn = false) {
        if (isOwn) return 1;
        
        const player = getPlayer();
        if (!player) return 0.5; // Default if no player
        
        const dist = Math.hypot(x - player.x, y - player.y);
        // Exponential falloff: vol = 0.5 ^ (dist / falloffDistance)
        const vol = Math.pow(0.5, dist / this.falloffDistance);
        return Math.max(0.05, Math.min(1, vol)); // Clamp between 0.05 and 1
    }

    playTone(freq, type, duration, vol, slide = 0) {
        if (!this.ctx) return;
        
        // Guard against non-finite values
        if (!isFinite(freq) || !isFinite(duration) || !isFinite(vol)) return;
        if (vol < 0.01) return; // Skip very quiet sounds
        
        freq = Math.max(20, Math.min(20000, freq)); // Clamp to audible range
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        if (slide !== 0) {
            osc.frequency.exponentialRampToValueAtTime(
                Math.max(10, freq + slide),
                this.ctx.currentTime + duration
            );
        }
        
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    // === PLAYER'S OWN SOUNDS (always full volume) ===
    
    shoot(power) {
        this.playTone(400 - (power * 200), 'sawtooth', 0.1 + (power * 0.2), 0.1, -200);
        this.playTone(100, 'square', 0.05, 0.1, -50);
    }

    dash() {
        this.playTone(100, 'triangle', 0.3, 0.2, -50);
    }

    collect() {
        this.playTone(800 + Math.random() * 400, 'sine', 0.1, 0.05);
    }

    die() {
        this.playTone(50, 'sawtooth', 0.5, 0.4, -10);
        this.playTone(100, 'square', 0.3, 0.3, -80);
    }

    // === SPATIAL SOUNDS (distance-based falloff) ===

    impactAt(x, y, isOwn = false) {
        const vol = this.getVolumeForDistance(x, y, isOwn);
        this.playTone(150, 'square', 0.1, 0.1 * vol, -100);
    }

    blockAt(x, y, isOwn = false) {
        const vol = this.getVolumeForDistance(x, y, isOwn);
        this.playTone(1200, 'sine', 0.15, 0.15 * vol, 200);
        this.playTone(800, 'triangle', 0.1, 0.1 * vol, 100);
    }

    stunAt(x, y, isOwn = false) {
        const vol = this.getVolumeForDistance(x, y, isOwn);
        this.playTone(800, 'square', 0.1, 0.1 * vol, -400);
        this.playTone(600, 'square', 0.1, 0.1 * vol, -400);
    }

    comboAt(x, y, isOwn = false) {
        const vol = this.getVolumeForDistance(x, y, isOwn);
        this.playTone(1000, 'sine', 0.2, 0.2 * vol, 500);
    }

    insolventAt(x, y, isOwn = false) {
        const vol = this.getVolumeForDistance(x, y, isOwn);
        this.playTone(200, 'sawtooth', 0.1, 0.1 * vol, -50);
    }

    // === LEGACY (non-spatial, for backwards compatibility) ===
    
    impact() {
        this.playTone(150, 'square', 0.1, 0.1, -100);
    }

    block() {
        this.playTone(1200, 'sine', 0.15, 0.15, 200);
        this.playTone(800, 'triangle', 0.1, 0.1, 100);
    }

    stun() {
        this.playTone(800, 'square', 0.1, 0.1, -400);
        this.playTone(600, 'square', 0.1, 0.1, -400);
    }

    combo() {
        this.playTone(1000, 'sine', 0.2, 0.2, 500);
    }

    insolvent() {
        this.playTone(200, 'sawtooth', 0.1, 0.1, -50);
    }
}

export const Audio = new AudioSystem();
