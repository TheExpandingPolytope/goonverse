import type { WorldInputController } from './adapters'

type ListenerCleanup = () => void

/**
 * Attach browser input listeners to the canvas and forward normalized input
 * events into the provided WorldInputController.
 *
 * - Pointer movement is reported in normalized canvas coordinates (0-1).
 * - Q key is treated as the Exit (hold-to-exit) key.
 * - Spacebar is treated as the Split key (hold or tap).
 * - W key is treated as the Eject key (hold or tap).
 */
export const attachInputListeners = (
  canvas: HTMLCanvasElement,
  controller: WorldInputController,
): ListenerCleanup => {
  const handlePointerMove = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect()
    const normalized = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    }
    controller.onPointerMove(normalized)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return

    if (event.code === 'KeyQ') {
      controller.onExitKeyDown()
      return
    }

    if (event.code === 'Space') {
      event.preventDefault()
      controller.onSplitKeyDown()
      return
    }

    if (event.code === 'KeyW') {
      controller.onEjectKeyDown()
    }
  }

  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.code === 'KeyQ') {
      controller.onExitKeyUp()
      return
    }

    if (event.code === 'Space') {
      controller.onSplitKeyUp()
      return
    }

    if (event.code === 'KeyW') {
      controller.onEjectKeyUp()
    }
  }

  window.addEventListener('mousemove', handlePointerMove)
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)

  return () => {
    window.removeEventListener('mousemove', handlePointerMove)
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
  }
}
