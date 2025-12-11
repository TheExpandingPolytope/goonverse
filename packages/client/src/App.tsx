import { Overlay } from './components/overlay/Overlay'
import { World } from './world/World'

function App() {
  return (
    <div className="app-shell">
      <World />
      <Overlay />
    </div>
  )
}

export default App
