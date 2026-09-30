import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, getToken, setToken, SIGNED_OUT_EVENT, type LoginCodeResponse, type Me } from './api'

type AuthCtx = {
  user: Me | null
  ready: boolean
  /** Step 1: company email + password → a 6-digit code e-mailed to that address. */
  requestCode: (email: string, password: string) => Promise<LoginCodeResponse>
  /** Step 2: the same credentials plus the code → signed in. */
  login: (email: string, password: string, code: string) => Promise<Me>
  logout: () => Promise<void>
  refresh: () => Promise<Me | null>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      setReady(true)
      return null
    }
    try {
      const u = await api.get<Me>('/auth/me')
      setUser(u)
      return u
    } catch {
      setToken(null)
      setUser(null)
      return null
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    refresh()
    const onSignedOut = () => setUser(null)
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut)
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut)
  }, [refresh])

  const requestCode = useCallback(
    (email: string, password: string) => api.post<LoginCodeResponse>('/auth/login/code', { email, password }),
    [],
  )

  const login = useCallback(async (email: string, password: string, code: string) => {
    const r = await api.post<{ token: string; user: Me }>('/auth/login', { email, password, code })
    setToken(r.token)
    setUser(r.user)
    return r.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch {}
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, ready, requestCode, login, logout, refresh }), [user, ready, requestCode, login, logout, refresh])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
