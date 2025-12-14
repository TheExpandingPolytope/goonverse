import { Overlay } from './components/overlay/Overlay'
import { Navbar } from './components/nav/Navbar'
import { World } from './world/World'

function App() {
  return (
    <div className="app-shell">
      <World />
      <Navbar />
      <Overlay />
    </div>
  )
}

export default App
