type ListenerCleanup = () => void

export const attachInputListeners = (canvas: HTMLCanvasElement): ListenerCleanup => {
  const handleMouseMove = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect()
    const normalized = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    }
    console.debug('[Input] cursor', normalized)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'Space') {
      console.debug('[Input] hold-to-exit start')
    }
  }

  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.code === 'Space') {
      console.debug('[Input] hold-to-exit stop')
    }
  }

  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)

  return () => {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
  }
}

