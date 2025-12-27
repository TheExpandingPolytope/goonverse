import { Overlay } from './components/overlay/Overlay'
import { Navbar } from './components/nav/Navbar'
import { Hud } from './components/hud/Hud'
import { World } from './world/World'
import { HudProvider } from './hooks/useHud'

function App() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <HudProvider>
        <World />
        <Navbar />
        <Hud />
        <Overlay />
      </HudProvider>
    </div>
  )
}

export default App
