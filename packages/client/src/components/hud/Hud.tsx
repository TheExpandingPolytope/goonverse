import { useMemo } from 'react'
import { useHud } from '@/hooks/useHud'
import { useGameClientContext } from '@/hooks/useGameSession'
import { useUI } from '@/hooks/useUI'
import { formatEth, formatUsd } from '@/lib/formatter'

/**
 * POC Parity HUD Layout:
 * - Bottom center: Balance + PnL badge
 * - Top right: Leaderboard
 * - Bottom right: Transaction log
 * - Top center: Event feed
 * - Left: Controls hint (optional)
 */
export const Hud = () => {
  const hud = useHud()
  const { phase } = useGameClientContext()
  const { isOverlayVisible } = useUI()

  const show = phase === 'ingame' && !isOverlayVisible && hud

  const leaderboard = useMemo(() => {
    return (hud?.leaderboard ?? []).slice(0, 5)
  }, [hud])

  if (!show) return null

  const pnlPct = hud.pnlPct ?? 0
  const pnlSign = pnlPct >= 0 ? '+' : ''
  const worthText = formatUsd(hud.localUsdWorth, true)

  // PnL badge color
  const pnlColor =
    Math.abs(pnlPct) < 1
      ? 'text-gray-500'
      : pnlPct > 0
        ? 'text-[#4ade80]'
        : 'text-[#fb7185]'

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* ═══════════════════════════════════════════════════════════════════
          TOP RIGHT: Leaderboard (POC style - compact)
          ═══════════════════════════════════════════════════════════════════ */}
      {hud.showLeaderboard !== false && (
        <div className="absolute top-4 right-4 w-40">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center mb-2">
            Leaderboard
          </div>
          <div className="space-y-0.5">
            {leaderboard.map((e, i) => {
              const name =
                e.displayName.length > 12
                  ? `${e.displayName.slice(0, 11)}…`
                  : e.displayName || 'anon'
              return (
                <div
                  key={`${e.sessionId}-${i}`}
                  className={[
                    'flex justify-between items-center text-xs font-semibold py-0.5 border-b border-[#1a1a22]',
                    e.isLocal ? 'text-[#4ade80]' : 'text-gray-300',
                    i === 0 ? 'text-[13px] font-bold' : '',
                  ].join(' ')}
                >
                  <span>
                    #{i + 1} {e.isLocal ? 'YOU' : name}
                  </span>
                  <span className="tabular-nums">{formatUsd(e.usdValue, true)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TOP CENTER: Event Feed (POC style - kills, exits, stuns)
          ═══════════════════════════════════════════════════════════════════ */}
      {hud.events && hud.events.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
          {hud.events.slice(0, 4).map((e) => (
            <div
              key={e.id}
              className={[
                'text-sm font-bold px-3 py-1 rounded bg-black/60 backdrop-blur-sm',
                e.variant === 'exit'
                  ? 'text-[#4ade80]'
                  : e.variant === 'danger'
                    ? 'text-[#fb7185]'
                    : 'text-[#fcd34d]',
              ].join(' ')}
            >
              {e.message}
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          BOTTOM RIGHT: Transaction Log (POC style - compact)
          ═══════════════════════════════════════════════════════════════════ */}
      {hud.transactions && hud.transactions.length > 0 && (
        <div className="absolute bottom-4 right-4 w-28 text-right flex flex-col gap-0.5">
          {hud.transactions.slice(0, 5).map((t) => (
            <div
              key={t.id}
              className={[
                'text-xs font-bold tabular-nums opacity-70',
                t.type === 'gain' ? 'text-[#4ade80]' : 'text-[#fb7185]',
              ].join(' ')}
            >
              {t.type === 'gain' ? '+' : '-'}
              {formatUsd(t.amount, true)}
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          BOTTOM LEFT: Controls Hint (POC style - optional)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="absolute bottom-4 left-4 text-[10px] text-gray-600 font-medium leading-tight">
        <div>WASD: Move</div>
        <div>Mouse: Aim</div>
        <div>LMB: Shoot (hold to charge)</div>
        <div>RMB/Space: Dash (hold to charge)</div>
        <div>Q: Exit (hold)</div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          BOTTOM CENTER: Balance + PnL Badge (POC style - main HUD)
          ═══════════════════════════════════════════════════════════════════ */}
      {hud.showBottomWorth !== false && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <div className="flex items-center justify-center gap-3 px-6 py-3 bg-[#1a1a22]/90 border border-white/10 rounded-lg backdrop-blur-sm shadow-lg">
            {/* Main balance */}
            <div className="text-[28px] font-extrabold text-[#4ade80] tabular-nums leading-none">
              {worthText.replace('$', '')}
            </div>
            {/* PnL badge inline */}
            <div className={`text-[28px] font-extrabold leading-none ${pnlColor}`}>
              ({pnlSign}{pnlPct.toFixed(0)}%)
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TOP LEFT: Status indicators (stun, slow, dash cooldown)
          ═══════════════════════════════════════════════════════════════════ */}
      {hud.showTopLeftStats !== false && (
        <div className="absolute top-4 left-4 flex flex-col gap-1">
          {hud.stunTicks && hud.stunTicks > 0 ? (
            <div className="text-xs font-bold text-[#fcd34d] bg-black/50 px-2 py-1 rounded">
              STUNNED ({hud.stunTicks}t)
            </div>
          ) : null}
          {hud.slowTicks && hud.slowTicks > 0 ? (
            <div className="text-xs font-bold text-[#fb7185] bg-black/50 px-2 py-1 rounded">
              SLOWED ({hud.slowTicks}t)
            </div>
          ) : null}
          {hud.exitCombatTagTicks && hud.exitCombatTagTicks > 0 ? (
            <div className="text-xs font-bold text-[#fb7185] bg-black/50 px-2 py-1 rounded">
              IN COMBAT ({hud.exitCombatTagTicks}t)
            </div>
          ) : null}
          {hud.exitHoldProgress > 0 ? (
            <div className="text-xs font-bold text-[#4ade80] bg-black/50 px-2 py-1 rounded">
              CASHING OUT {(hud.exitHoldProgress * 100).toFixed(0)}%
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
