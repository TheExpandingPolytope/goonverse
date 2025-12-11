import { useState } from 'react'

export const useLobbyState = () => {
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [buyInEth, setBuyInEth] = useState(0.01)

  return {
    selectedServerId,
    buyInEth,
    setSelectedServerId,
    setBuyInEth,
  }
}

