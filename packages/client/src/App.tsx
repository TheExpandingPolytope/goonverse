import { useEffect, useRef } from 'react'
import { Overlay } from './components/overlay/Overlay'
import { Navbar } from './components/nav/Navbar'
import { Hud } from './components/hud/Hud'
import { World } from './world/World'
import { HudProvider } from './hooks/useHud'
import { useFxTriggers } from './hooks/useFxTriggers'
import { setFlashElement, gameAudio } from './lib/fx'

function FxTriggerBridge() {
  // POC parity: Hook to trigger FX based on HUD state changes
  useFxTriggers()
  return null
}

function App() {
  const flashRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // POC parity: Wire up flash element
    if (flashRef.current) {
      setFlashElement(flashRef.current)
    }
    return () => setFlashElement(null)
  }, [])

  // Initialize audio on first user interaction
  useEffect(() => {
    const initAudio = () => {
      gameAudio.init()
      document.removeEventListener('click', initAudio)
      document.removeEventListener('keydown', initAudio)
    }
    document.addEventListener('click', initAudio)
    document.addEventListener('keydown', initAudio)
    return () => {
      document.removeEventListener('click', initAudio)
      document.removeEventListener('keydown', initAudio)
    }
  }, [])

  return (
    <div className="relative min-h-screen overflow-hidden">
      <HudProvider>
        <FxTriggerBridge />
        <World />
        <Navbar />
        <Hud />
        <Overlay />
        {/* POC parity: Damage flash overlay */}
        <div
          ref={flashRef}
          className="pointer-events-none absolute inset-0 z-50 transition-all duration-50"
        />
      </HudProvider>
    </div>
  )
}

export default App
