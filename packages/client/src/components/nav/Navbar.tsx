import { useAuth } from '@/hooks/useAuth'
import { useWallet } from '@/hooks/useWallet'
import { useEthUsdPrice } from '@/hooks/useEthUsdPrice'
import { ethToUsd, formatUsd } from '@/lib/formatter'
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Copy, Share2, User } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

export const Navbar = () => {
  const { isAuthenticated, primaryHandle } = useAuth()
  const { activeAddress, ethBalance } = useWallet()
  const { ethUsd } = useEthUsdPrice()

  const walletUsd = ethToUsd(ethBalance, ethUsd)
  const handle = primaryHandle ?? (activeAddress ? `${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}` : 'anon')
  const walletUsdLabel = useMemo(() => formatUsd(walletUsd, true), [walletUsd])

  const [inviteOpen, setInviteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const referralLink = `https://globs.fun/ref/${encodeURIComponent(handle)}`

  const handleCopy = () => {
    void navigator.clipboard.writeText(referralLink)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    if (!inviteOpen && !menuOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInviteOpen(false)
        setMenuOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [inviteOpen, menuOpen])

  const onDeposit = () => {
    console.info('[Navbar] Deposit clicked (TODO: wire flow)')
    setMenuOpen(false)
  }

  const onWithdraw = () => {
    console.info('[Navbar] Withdraw clicked (TODO: wire flow)')
    setMenuOpen(false)
  }

  return (
    <nav className="pointer-events-auto absolute top-0 left-0 right-0 z-20 px-4 sm:px-6 py-4">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 sm:w-10 sm:h-10">
            <div className="absolute inset-0 blob-shape bg-[#4ade80] blur-xl opacity-50 animate-pulse-green"></div>
            <div className="relative w-full h-full blob-shape bg-gradient-to-br from-[#86efac] via-[#4ade80] to-[#22c55e] shadow-lg flex items-center justify-center">
              <span className="text-[#0a0a0a]/20 font-black text-xl sm:text-2xl">$</span>
            </div>
          </div>
          <span className="font-black text-2xl sm:text-[26px] tracking-tight">
            <span className="gradient-text-white-sm">globs</span>
            <span className="logo-green">.fun</span>
          </span>
        </div>

        {isAuthenticated && (
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="p-2.5 sm:px-4 sm:py-2.5 rounded-xl card-premium card-premium-hover transition-all flex items-center gap-2"
            >
              <Share2 className="w-4 h-4 text-gray-400" />
              <span className="hidden sm:inline text-sm font-semibold text-gray-300">Invite & Earn</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="px-3 sm:px-4 py-2.5 rounded-xl card-premium card-premium-hover transition-all flex items-center gap-2 sm:gap-3"
                aria-expanded={menuOpen}
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center border border-white/[0.1]">
                  <User className="w-4 h-4 text-gray-300" />
                </div>
                <span className="hidden sm:block font-semibold text-sm text-gray-300 max-w-[80px] truncate">
                  {handle}
                </span>
                <span className="text-[15px] font-bold text-[#4ade80] text-glow-green-subtle">{walletUsdLabel}</span>

                <div className="hidden sm:flex items-center gap-1.5 ml-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeposit()
                    }}
                    className="px-2.5 py-1.5 rounded-lg btn-secondary text-gray-400 hover:text-[#4ade80] flex items-center gap-1.5 text-xs font-semibold"
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    Deposit
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onWithdraw()
                    }}
                    className="px-2.5 py-1.5 rounded-lg btn-secondary text-gray-400 hover:text-white flex items-center gap-1.5 text-xs font-semibold"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Withdraw
                  </button>
                </div>

                <ChevronDown className="w-4 h-4 text-gray-600 sm:hidden" />
              </button>

              {menuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close menu"
                    className="fixed inset-0 z-10 sm:hidden cursor-default"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-2 rounded-xl bg-[#0c0c12]/98 backdrop-blur-2xl border border-white/[0.08] w-36 p-1.5 shadow-2xl sm:hidden">
                    <button
                      type="button"
                      onClick={onDeposit}
                      className="w-full cursor-pointer font-semibold text-sm rounded-lg py-2.5 px-2 text-gray-400 hover:text-[#4ade80] hover:bg-white/[0.04] flex items-center gap-2"
                    >
                      <ArrowDownLeft className="w-4 h-4" />
                      Deposit
                    </button>
                    <button
                      type="button"
                      onClick={onWithdraw}
                      className="w-full cursor-pointer font-semibold text-sm rounded-lg py-2.5 px-2 text-gray-400 hover:text-white hover:bg-white/[0.04] flex items-center gap-2"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      Withdraw
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {inviteOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close invite dialog"
            className="absolute inset-0 bg-black/60"
            onClick={() => setInviteOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full sm:max-w-[380px] rounded-2xl card-premium backdrop-blur-2xl p-6 sm:p-7"
          >
            <div className="text-xl font-extrabold gradient-text-white">Invite Friends & Earn</div>
            <div className="text-gray-500 pt-1.5 text-sm font-medium">
              Share your link and earn <span className="text-[#4ade80] font-bold text-glow-green-subtle">5%</span> from
              invited players
            </div>

            <div className="space-y-4 pt-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={referralLink}
                  className="flex-1 px-3 py-3 rounded-xl input-premium text-xs font-mono text-gray-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-4 py-3 rounded-xl bg-gradient-to-b from-[#4ade80] to-[#22c55e] hover:from-[#86efac] hover:to-[#4ade80] text-[#0a0a0a] font-bold text-sm transition-all flex items-center gap-2 shadow-lg glow-green"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="bg-white/[0.02] rounded-xl p-4 text-[13px] text-gray-500 space-y-2 border border-white/[0.05]">
                <p className="flex items-center gap-2">
                  <span className="text-[#4ade80]">•</span> Friends sign up with your link
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-[#4ade80]">•</span> Earn 5% of house revenue from their games
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-[#4ade80]">•</span> Paid automatically to your balance
                </p>
              </div>

              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="w-full px-4 py-3 rounded-xl btn-secondary text-gray-300 font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}


