const usdFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const usdCompactFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
})

const ethFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
})

export function formatUsd(amount: number | null | undefined, compact: boolean = false): string {
  if (amount == null) return '—'
  if (!Number.isFinite(amount)) return '—'
  return (compact ? usdCompactFormatter : usdFormatter).format(amount)
}

export function formatEth(eth: number | null | undefined): string {
  if (eth == null) return '—'
  if (!Number.isFinite(eth)) return '—'
  return `${ethFormatter.format(eth)} ETH`
}

export function ethToUsd(eth: number, ethUsd: number | null): number {
  // If we don't have a price feed, return NaN so formatters display "—" rather than "$0".
  if (!Number.isFinite(eth) || ethUsd == null || !Number.isFinite(ethUsd)) return Number.NaN
  return eth * ethUsd
}

/** Convert mass to ETH given server scalar `massPerEth` (mass units per 1 ETH). */
export function massToEth(mass: number, massPerEth: number): number {
  if (!Number.isFinite(mass) || !Number.isFinite(massPerEth) || massPerEth <= 0) return 0
  return mass / massPerEth
}

export function massToUsd(mass: number, massPerEth: number, ethUsd: number | null): number {
  return ethToUsd(massToEth(mass, massPerEth), ethUsd)
}


