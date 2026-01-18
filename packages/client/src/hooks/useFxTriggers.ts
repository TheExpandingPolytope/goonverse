/**
 * POC Parity: Hook to trigger FX (audio, particles, shake, flash) based on game state changes.
 * Call this from the game loop or as an effect when deltas arrive.
 */

import { useEffect, useRef } from 'react'
import { useHud } from './useHud'
import {
  gameAudio,
  addShake,
  addShockwave,
  createParticles,
  flashDamage,
  flashGain,
} from '@/lib/fx'

// POC colors
const COLORS = {
  primary: '#4ade80',
  danger: '#fb7185',
  warning: '#fcd34d',
}

/**
 * Track previous HUD values to detect changes.
 */
export function useFxTriggers() {
  const hud = useHud()
  const prevMassRef = useRef<number | null>(null)
  const prevStunRef = useRef<number>(0)
  const prevExitProgressRef = useRef<number>(0)

  useEffect(() => {
    if (!hud) return

    const currentMass = hud.currentMass ?? 0
    const prevMass = prevMassRef.current

    // Mass delta -> gain/loss sound + flash
    if (prevMass !== null && currentMass !== prevMass) {
      const delta = currentMass - prevMass
      if (Math.abs(delta) > 0.001) {
        if (delta > 0) {
          gameAudio.collect()
          flashGain()
        } else {
          flashDamage(Math.min(1, Math.abs(delta) * 10))
          addShake(Math.min(10, Math.abs(delta) * 20))
        }
      }
    }
    prevMassRef.current = currentMass

    // Stun started -> sound
    const stunTicks = hud.stunTicks ?? 0
    if (stunTicks > 0 && prevStunRef.current === 0) {
      gameAudio.playTone(800, 'square', 0.1, 0.1, -400)
      addShake(8)
    }
    prevStunRef.current = stunTicks

    // Exit completed -> sound
    const exitProgress = hud.exitHoldProgress ?? 0
    if (exitProgress >= 1 && prevExitProgressRef.current < 1) {
      gameAudio.exitComplete()
    }
    prevExitProgressRef.current = exitProgress
  }, [hud])
}

/**
 * Trigger FX manually from outside React (e.g., from renderer or adapters).
 */
export const fxTriggers = {
  shoot(power: number) {
    gameAudio.shoot(power)
    addShake(3 + power * 5)
  },
  dash() {
    gameAudio.dash()
    addShake(4)
  },
  collect() {
    gameAudio.collect()
  },
  die() {
    gameAudio.die()
    flashDamage(1)
    addShake(20)
  },
  impact(x: number, y: number, listenerX: number, listenerY: number, isOwn: boolean) {
    gameAudio.impactAt(x, y, listenerX, listenerY, isOwn)
    addShockwave(x, y, 1, COLORS.danger)
    createParticles(x, y, 5, COLORS.danger, 4)
    if (isOwn) {
      flashDamage(0.5)
      addShake(6)
    }
  },
  stun(x: number, y: number, listenerX: number, listenerY: number, isOwn: boolean) {
    gameAudio.stunAt(x, y, listenerX, listenerY, isOwn)
    createParticles(x, y, 4, COLORS.warning, 3)
    if (isOwn) {
      addShake(10)
    }
  },
  pelletCollect(x: number, y: number) {
    createParticles(x, y, 3, COLORS.primary, 2)
  },
}
