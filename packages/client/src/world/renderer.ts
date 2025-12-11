export const bootstrapRenderer = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d')

  let animationFrameId: number | null = null

  const render = () => {
    if (!context) return
    const { width, height } = canvas
    context.clearRect(0, 0, width, height)

    context.fillStyle = 'rgba(255, 255, 255, 0.03)'
    context.fillRect(0, 0, width, height)

    animationFrameId = requestAnimationFrame(render)
  }

  const handleResize = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }

  handleResize()
  window.addEventListener('resize', handleResize)
  render()

  return () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId)
    window.removeEventListener('resize', handleResize)
  }
}

