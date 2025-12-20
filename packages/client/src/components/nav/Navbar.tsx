import { useRooms } from '@/hooks/useRooms'
import { useAuth } from '@/hooks/useAuth'
import { useWallet } from '@/hooks/useWallet'
import { useEthUsdPrice } from '@/hooks/useEthUsdPrice'
import { ethToUsd, formatEth, formatUsd } from '@/lib/formatter'

export const Navbar = () => {
  const { rooms } = useRooms()
  const { isAuthenticated, primaryHandle } = useAuth()
  const { activeAddress, ethBalance } = useWallet()
  const { ethUsd } = useEthUsdPrice()

  const aggregatePlayers = rooms.reduce((sum, room) => sum + room.playerCount, 0)
  const aggregateBankrollEth = rooms.reduce((sum, room) => sum + room.totalWorldEth, 0)
  const aggregateBankrollUsd = ethToUsd(aggregateBankrollEth, ethUsd)
  const walletUsd = ethToUsd(ethBalance, ethUsd)

  return (
    <nav className="navbar">
      <div className="navbar__brand">globs.fun</div>
      <div className="navbar__status">
        <span>{aggregatePlayers} players live</span>
        <span>
          World bankroll {formatUsd(aggregateBankrollUsd, true)}{' '}
          <span className="navbar__muted">({formatEth(aggregateBankrollEth)})</span>
        </span>
      </div>
      <div className="navbar__wallet">
        {isAuthenticated ? (
          <>
            <span>{primaryHandle}</span>
            <span>·</span>
            <span>
              {formatUsd(walletUsd, true)} <span className="navbar__muted">({formatEth(ethBalance)})</span>
            </span>
          </>
        ) : (
          <span>Sign in to play</span>
        )}
        {activeAddress ? <span className="navbar__muted">({activeAddress.slice(0, 6)}…)</span> : null}
      </div>
    </nav>
  )
}


