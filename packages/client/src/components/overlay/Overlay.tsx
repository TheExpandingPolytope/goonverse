import { PlayButton } from './PlayButton'
import { useRooms } from '@/hooks/useRooms'
import { useAuth } from '@/hooks/useAuth'
import { useWallet } from '@/hooks/useWallet'
import { useUI } from '@/hooks/useUI'

export const Overlay = () => {
  const { rooms } = useRooms()
  const { isAuthenticated, primaryHandle } = useAuth()
  const { activeAddress, ethBalance } = useWallet()
  const { isOverlayVisible } = useUI()

  const aggregatePlayers = rooms.reduce((sum, room) => sum + room.playerCount, 0)
  const aggregateBankroll = rooms.reduce((sum, room) => sum + room.totalWorldEth, 0)

  if (!isOverlayVisible) {
    return null
  }

  return (
    <div className="overlay">
      <nav className="overlay__navbar">
        <div className="overlay__brand">AGARCASH</div>
        <div className="overlay__status">
          <span>{aggregatePlayers} players live</span>
          <span>World bankroll {aggregateBankroll.toLocaleString()}</span>
        </div>
        <div className="overlay__wallet">
          {isAuthenticated ? (
            <>
              <span>{primaryHandle}</span>
              <span>·</span>
              <span>{ethBalance.toFixed(4)} ETH</span>
            </>
          ) : (
            <span>Sign in to play</span>
          )}
          {activeAddress ? <span>({activeAddress.slice(0, 6)}…)</span> : null}
        </div>
      </nav>

      <div className="overlay__card-container">
        <div className="overlay__card">
          <h1 className="overlay__title">agarcash.io</h1>
          <p className="overlay__subtitle">Earn real money playing agar.</p>
          <PlayButton servers={rooms} />
        </div>
      </div>
    </div>
  )
}

