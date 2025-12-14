/**
 * Colyseus join can briefly expose a truthy placeholder state (e.g. `{}`)
 * before the first schema patch arrives. This helper gates rendering logic
 * until the snapshot has the expected MapSchema-like collections.
 */
export const isSnapshotReady = (state: unknown): boolean => {
  if (!state || typeof state !== 'object') return false
  const s = state as Record<string, unknown>

  const players = s.players as { forEach?: unknown } | undefined
  const pellets = s.pellets as { forEach?: unknown } | undefined
  const ejectedMass = s.ejectedMass as { forEach?: unknown } | undefined

  return (
    typeof players?.forEach === 'function' &&
    typeof pellets?.forEach === 'function' &&
    typeof ejectedMass?.forEach === 'function'
  )
}


