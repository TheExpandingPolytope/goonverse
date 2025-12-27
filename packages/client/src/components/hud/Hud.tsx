import { useMemo } from 'react'
import { useHud } from '@/hooks/useHud'
import { useGameClientContext } from '@/hooks/useGameSession'
import { useUI } from '@/hooks/useUI'
import { formatUsd } from '@/lib/formatter'

export const Hud = () => {
  const hud = useHud()
  const { phase } = useGameClientContext()
  const { isOverlayVisible } = useUI()

  const show = phase === 'ingame' && !isOverlayVisible && hud

  const rows = useMemo(() => {
    // Keep it readable on small screens.
    const leaderboard = hud?.leaderboard ?? []
    return leaderboard.slice(0, 10)
  }, [hud])

  if (!show) return null

  const massText = `Mass: ${Math.floor(hud.currentMass)}`
  const exitText = hud.exitHoldProgress > 0 ? `Exit: ${(hud.exitHoldProgress * 100).toFixed(0)}%` : null
  const worthText = formatUsd(hud.localUsdWorth, true)

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Match Navbar horizontal layout: outer px + inner max-w container */}
      <div
        className="px-4 sm:px-6"
        style={{
          paddingTop: 'calc(var(--navbar-h, 64px) + 12px)',
        }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between max-w-7xl mx-auto">
          {hud.showTopLeftStats !== false ? (
            <div className="w-full sm:w-auto">
              <div className="rounded-xl border border-white/[0.08] bg-black/45 backdrop-blur-xl px-4 py-3 shadow-2xl">
                <div className="text-white text-sm sm:text-base font-semibold">{massText}</div>
                {exitText ? <div className="text-[#4ade80] text-xs sm:text-sm font-semibold pt-0.5">{exitText}</div> : null}
              </div>
            </div>
          ) : (
            <div />
          )}

          {hud.showLeaderboard !== false ? (
            <div className="w-full sm:w-[320px]">
              <div className="rounded-2xl border border-white/[0.08] bg-[#0c0c12]/80 backdrop-blur-2xl shadow-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/[0.06]">
                  <div className="text-white text-sm font-extrabold">Leaderboard</div>
                </div>
                <div className="px-2 py-2">
                  {rows.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-gray-500">No players yet</div>
                  ) : (
                    <div className="space-y-1">
                      {rows.map((e, i) => {
                        const name =
                          e.displayName.length > 18 ? `${e.displayName.slice(0, 17)}…` : e.displayName || 'anon'
                        return (
                          <div
                            key={`${e.sessionId}-${i}`}
                            className={[
                              'flex items-center justify-between gap-3 rounded-lg px-3 py-1.5',
                              e.isLocal ? 'bg-[#00FF88]/10' : 'bg-transparent',
                            ].join(' ')}
                          >
                            <div
                              className={[
                                'text-xs sm:text-[13px] truncate',
                                e.isLocal ? 'text-[#00FF88] font-semibold' : 'text-white/90 font-normal',
                              ].join(' ')}
                            >
                              {i + 1}. {name}
                            </div>
                            <div className="text-xs sm:text-[13px] text-[#00FF88] font-semibold tabular-nums shrink-0">
                              {formatUsd(e.usdValue, true)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {hud.showBottomWorth !== false ? (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center">
          <div className="px-4 sm:px-6 w-full">
            <div className="max-w-7xl mx-auto flex justify-center">
            <div className="rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-xl px-5 py-3 shadow-2xl">
              <div className="text-[#00FF88] text-2xl sm:text-3xl font-black tracking-tight tabular-nums">{worthText}</div>
            </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}


