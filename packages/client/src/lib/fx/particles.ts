/**
 * POC Parity: Simple particle system.
 * Particles are circles that fade out.
 */

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

const particles: Particle[] = []
const MAX_PARTICLES = 200

/**
 * Create particles at a position.
 */
export function createParticles(
  x: number,
  y: number,
  count: number,
  color: string,
  speed = 3
) {
  const actualCount = Math.min(count, 8) // Cap per event

  for (let i = 0; i < actualCount; i++) {
    if (particles.length >= MAX_PARTICLES) break

    const angle = Math.random() * Math.PI * 2
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed * (0.5 + Math.random() * 0.5),
      vy: Math.sin(angle) * speed * (0.5 + Math.random() * 0.5),
      life: 20 + Math.random() * 15,
      maxLife: 35,
      color,
      size: 3 + Math.random() * 3,
    })
  }
}

/**
 * Update particles (call each tick).
 */
export function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x += p.vx
    p.y += p.vy
    p.vx *= 0.92 // Friction
    p.vy *= 0.92
    p.life--
    if (p.life <= 0) {
      particles.splice(i, 1)
    }
  }
}

/**
 * Draw particles to canvas.
 */
export function drawParticles(ctx: CanvasRenderingContext2D) {
  for (const p of particles) {
    const alpha = Math.min(1, p.life / 15)
    ctx.globalAlpha = alpha
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

export function getParticles(): Particle[] {
  return particles
}

export function clearParticles() {
  particles.length = 0
}
