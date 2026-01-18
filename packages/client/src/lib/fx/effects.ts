/**
 * POC Parity: Screen effects (shake, flash, shockwaves).
 * Client-side only.
 */

// ═══════════════════════════════════════════════════════════════════
// SCREEN SHAKE
// ═══════════════════════════════════════════════════════════════════

type ShakeState = {
  amount: number
  offsetX: number
  offsetY: number
}

const shake: ShakeState = {
  amount: 0,
  offsetX: 0,
  offsetY: 0,
}

/**
 * Add screen shake.
 * @param amount - Base shake amount (pixels)
 * @param intensity - Multiplier (0-1) for distance falloff
 */
export function addShake(amount: number, intensity = 1) {
  const finalAmount = amount * intensity * intensity
  shake.amount = Math.min(shake.amount + finalAmount, 40)
}

/**
 * Update shake state (call each frame).
 */
export function updateShake(dt: number) {
  if (shake.amount > 0) {
    shake.offsetX = (Math.random() - 0.5) * shake.amount * 2
    shake.offsetY = (Math.random() - 0.5) * shake.amount * 2
    shake.amount *= 0.9 // Decay
    if (shake.amount < 0.5) shake.amount = 0
  } else {
    shake.offsetX = 0
    shake.offsetY = 0
  }
}

export function getShakeOffset(): { x: number; y: number } {
  return { x: shake.offsetX, y: shake.offsetY }
}

// ═══════════════════════════════════════════════════════════════════
// SHOCKWAVES
// ═══════════════════════════════════════════════════════════════════

type Shockwave = {
  x: number
  y: number
  r: number
  power: number
  life: number
  color: string
}

const shockwaves: Shockwave[] = []

export function addShockwave(x: number, y: number, power: number, color = '#ffffff') {
  shockwaves.push({ x, y, r: 1, power, life: 1.0, color })
}

export function updateShockwaves() {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i]
    s.r += 5
    s.life -= 0.05
    if (s.life <= 0) {
      shockwaves.splice(i, 1)
    }
  }
}

export function drawShockwaves(ctx: CanvasRenderingContext2D) {
  for (const s of shockwaves) {
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)

    // Inner ring
    ctx.strokeStyle = `rgba(255,255,255,${s.life})`
    ctx.lineWidth = 3
    ctx.stroke()

    // Outer glow
    ctx.strokeStyle = `rgba(255,255,255,${s.life * 0.3})`
    ctx.lineWidth = 8
    ctx.stroke()
  }
}

export function getShockwaves(): Shockwave[] {
  return shockwaves
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN FLASH (DOM-based)
// ═══════════════════════════════════════════════════════════════════

let flashElement: HTMLElement | null = null

export function setFlashElement(el: HTMLElement | null) {
  flashElement = el
}

export function flashDamage(intensity = 1.0) {
  if (!flashElement) return
  const alpha = Math.min(0.6, 0.3 * intensity)
  flashElement.style.boxShadow = `inset 0 0 80px 40px rgba(244, 63, 94, ${alpha})`
  flashElement.style.background = `radial-gradient(circle at center, transparent 40%, rgba(244, 63, 94, ${alpha * 0.5}) 100%)`

  setTimeout(() => {
    if (!flashElement) return
    flashElement.style.boxShadow = 'inset 0 0 0 0px rgba(255, 0, 0, 0)'
    flashElement.style.background = 'transparent'
  }, 150)
}

export function flashGain() {
  if (!flashElement) return
  flashElement.style.boxShadow = `inset 0 0 60px 30px rgba(74, 222, 128, 0.2)`

  setTimeout(() => {
    if (!flashElement) return
    flashElement.style.boxShadow = 'inset 0 0 0 0px rgba(0, 0, 0, 0)'
  }, 100)
}
