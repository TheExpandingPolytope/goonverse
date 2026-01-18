/**
 * POC Parity: WebAudio synth for game sounds.
 * Supports spatial distance falloff.
 */

type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle'

class AudioSystem {
  private ctx: AudioContext | null = null
  private falloffDistance = 400 // Distance at which sound is 50% volume

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
  }

  /**
   * Calculate volume multiplier based on distance from listener.
   */
  getVolumeForDistance(
    x: number,
    y: number,
    listenerX: number,
    listenerY: number,
    isOwn = false
  ): number {
    if (isOwn) return 1
    const dist = Math.hypot(x - listenerX, y - listenerY)
    const vol = Math.pow(0.5, dist / this.falloffDistance)
    return Math.max(0.05, Math.min(1, vol))
  }

  playTone(
    freq: number,
    type: OscillatorType,
    duration: number,
    vol: number,
    slide = 0
  ) {
    if (!this.ctx) return

    // Guard against non-finite values
    if (!isFinite(freq) || !isFinite(duration) || !isFinite(vol)) return
    if (vol < 0.01) return

    freq = Math.max(20, Math.min(20000, freq))

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()

    osc.type = type
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime)

    if (slide !== 0) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(10, freq + slide),
        this.ctx.currentTime + duration
      )
    }

    gain.gain.setValueAtTime(vol, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)

    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + duration)
  }

  // ═══════════════════════════════════════════════════════════════════
  // PLAYER'S OWN SOUNDS (always full volume)
  // ═══════════════════════════════════════════════════════════════════

  shoot(power: number) {
    this.playTone(400 - power * 200, 'sawtooth', 0.1 + power * 0.2, 0.1, -200)
    this.playTone(100, 'square', 0.05, 0.1, -50)
  }

  dash() {
    this.playTone(100, 'triangle', 0.3, 0.2, -50)
  }

  collect() {
    this.playTone(800 + Math.random() * 400, 'sine', 0.1, 0.05)
  }

  die() {
    this.playTone(50, 'sawtooth', 0.5, 0.4, -10)
    this.playTone(100, 'square', 0.3, 0.3, -80)
  }

  exitComplete() {
    this.playTone(800, 'sine', 0.2, 0.15, 400)
    this.playTone(1200, 'sine', 0.15, 0.1, 200)
  }

  // ═══════════════════════════════════════════════════════════════════
  // SPATIAL SOUNDS (distance-based falloff)
  // ═══════════════════════════════════════════════════════════════════

  impactAt(x: number, y: number, listenerX: number, listenerY: number, isOwn = false) {
    const vol = this.getVolumeForDistance(x, y, listenerX, listenerY, isOwn)
    this.playTone(150, 'square', 0.1, 0.1 * vol, -100)
  }

  stunAt(x: number, y: number, listenerX: number, listenerY: number, isOwn = false) {
    const vol = this.getVolumeForDistance(x, y, listenerX, listenerY, isOwn)
    this.playTone(800, 'square', 0.1, 0.1 * vol, -400)
    this.playTone(600, 'square', 0.1, 0.1 * vol, -400)
  }
}

export const gameAudio = new AudioSystem()
