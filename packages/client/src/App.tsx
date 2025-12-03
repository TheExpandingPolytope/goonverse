import { GameCanvas } from './game/GameCanvas'
import './App.css'

function App() {
  return (
    <>
      <div className="ui-layer">
        <h1>AgarCash</h1>
        <p>Stateless Deposits • Upfront Rake • World Pool</p>
      </div>
      <GameCanvas />
    </>
  )
}

export default App
