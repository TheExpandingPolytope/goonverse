import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useMemo,
} from 'react'
import {
  usePrivy,
  useLogin,
  useLogout,
  type User,
} from '@privy-io/react-auth'

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated'

type AuthContextValue = {
  /** Whether the user is authenticated */
  isAuthenticated: boolean
  /** Current auth status */
  status: AuthStatus
  /** Privy user object (null if not authenticated) */
  user: User | null
  /** Primary display handle (email, twitter, or wallet address) */
  primaryHandle: string | null
  /** Privy DID (user identifier) */
  userId: string | null
  /** Open Privy login modal */
  login: () => void
  /** Log out the current user */
  logout: () => Promise<void>
  /** Get a fresh access token for server requests */
  getAccessToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/**
 * Extract a display handle from the Privy user
 */
function getPrimaryHandle(user: User | null): string | null {
  if (!user) return null

  // Prefer Twitter handle
  if (user.twitter?.username) {
    return `@${user.twitter.username}`
  }

  // Then email
  if (user.email?.address) {
    return user.email.address
  }

  // Then wallet address (truncated)
  const wallet = user.wallet?.address
  if (wallet) {
    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
  }

  return null
}

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const {
    ready,
    authenticated,
    user,
    getAccessToken: privyGetAccessToken,
  } = usePrivy()

  const { login: privyLogin } = useLogin()
  const { logout: privyLogout } = useLogout()

  const status: AuthStatus = useMemo(() => {
    if (!ready) return 'loading'
    return authenticated ? 'authenticated' : 'unauthenticated'
  }, [ready, authenticated])

  const login = useCallback(() => {
    privyLogin()
  }, [privyLogin])

  const logout = useCallback(async () => {
    await privyLogout()
  }, [privyLogout])

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!authenticated) return null
    try {
      const token = await privyGetAccessToken()
      return token
    } catch (error) {
      console.error('[Auth] Failed to get access token:', error)
      return null
    }
  }, [authenticated, privyGetAccessToken])

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: authenticated,
      status,
      user: user ?? null,
      primaryHandle: getPrimaryHandle(user ?? null),
      userId: user?.id ?? null,
      login,
      logout,
      getAccessToken,
    }),
    [authenticated, status, user, login, logout, getAccessToken],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Export context for hook file
export { AuthContext }
export type { AuthContextValue }
