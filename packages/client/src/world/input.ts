import type { WorldInputController } from './adapters'

type ListenerCleanup = () => void

/**
 * Attach browser input listeners to the canvas and forward normalized input
 * events into the provided WorldInputController.
 *
 * - Pointer movement is reported in normalized canvas coordinates (0-1).
 * - Q key is treated as the Exit (hold-to-exit) key.
 * - Spacebar or RMB is treated as Dash (hold to charge, release to dash).
 * - LMB is Shoot (hold to charge, release to fire).
 * - WASD are movement holds.
 */
export const attachInputListeners = (
  canvas: HTMLCanvasElement,
  controller: WorldInputController,
): ListenerCleanup => {
  const handleWheel = (event: WheelEvent) => {
    // Use wheel for zooming the view; prevent page scroll.
    event.preventDefault()
    controller.onWheelZoom({ deltaY: event.deltaY })
  }

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
      controller.onDashKeyDown()
      return
    }

    if (event.code === 'KeyW') {
      controller.onMoveKeyChange({ w: true })
      return
    }

    if (event.code === 'KeyA') {
      controller.onMoveKeyChange({ a: true })
      return
    }

    if (event.code === 'KeyS') {
      controller.onMoveKeyChange({ s: true })
      return
    }

    if (event.code === 'KeyD') {
      controller.onMoveKeyChange({ d: true })
    }
  }

  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.code === 'KeyQ') {
      controller.onExitKeyUp()
      return
    }

    if (event.code === 'Space') {
      controller.onDashKeyUp()
      return
    }

    if (event.code === 'KeyW') {
      controller.onMoveKeyChange({ w: false })
      return
    }

    if (event.code === 'KeyA') {
      controller.onMoveKeyChange({ a: false })
      return
    }

    if (event.code === 'KeyS') {
      controller.onMoveKeyChange({ s: false })
      return
    }

    if (event.code === 'KeyD') {
      controller.onMoveKeyChange({ d: false })
    }
  }

  const handleMouseDown = (event: MouseEvent) => {
    if (event.button === 0) {
      controller.onShootKeyDown()
      return
    }
    if (event.button === 2) {
      event.preventDefault()
      controller.onDashKeyDown()
    }
  }

  const handleMouseUp = (event: MouseEvent) => {
    if (event.button === 0) {
      controller.onShootKeyUp()
      return
    }
    if (event.button === 2) {
      event.preventDefault()
      controller.onDashKeyUp()
    }
  }

  const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault()
  }

  window.addEventListener('mousemove', handlePointerMove)
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('mousedown', handleMouseDown)
  window.addEventListener('mouseup', handleMouseUp)
  window.addEventListener('contextmenu', handleContextMenu)
  canvas.addEventListener('wheel', handleWheel, { passive: false })

  return () => {
    window.removeEventListener('mousemove', handlePointerMove)
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
    window.removeEventListener('mousedown', handleMouseDown)
    window.removeEventListener('mouseup', handleMouseUp)
    window.removeEventListener('contextmenu', handleContextMenu)
    canvas.removeEventListener('wheel', handleWheel)
  }
}
