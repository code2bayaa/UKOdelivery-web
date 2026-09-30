import { Link, Outlet, createRootRoute, useNavigate } from '@tanstack/react-router'
import { LogOut, Truck } from 'lucide-react'
import { AuthProvider, useAuth } from '#/lib/auth'
import { ToastProvider } from '#/lib/toast'

export const Route = createRootRoute({
  component: () => (
    <ToastProvider>
      <AuthProvider>
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <div className="flex flex-1 flex-col">
            <Outlet />
          </div>
        </div>
      </AuthProvider>
    </ToastProvider>
  ),
  notFoundComponent: NotFound,
})

function SiteHeader() {
  const { user, ready, logout } = useAuth()
  const navigate = useNavigate()
  const nav = 'rounded-md px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-surface hover:text-ink'
  const on = { className: 'bg-primary-050 text-primary hover:bg-primary-050 hover:text-primary' }
  return (
    <header className="sticky top-0 z-30 h-[57px] border-b border-border bg-bg/95 backdrop-blur">
      <div className="flex h-full items-center gap-3 px-4 md:px-7">
        <Link to="/" className="flex items-center gap-2 text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-white"><Truck size={17} /></span>
          <span className="font-head text-[15px] font-extrabold">UKO <span className="text-secondary">delivery</span></span>
        </Link>
        <nav className="ml-2 hidden items-center gap-1 sm:flex" aria-label="Main">
          {/* Apply is for visitors — a signed-in rider only gets the dashboard */}
          {!user && <Link to="/" className={nav} activeOptions={{ exact: true }} activeProps={on}>Apply</Link>}
          {user?.is_rider && <Link to="/dashboard" className={nav} activeProps={on}>Dashboard</Link>}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {!ready ? null : user ? (
            <>
              {user.is_rider && <Link to="/dashboard" className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-600 sm:hidden">Dashboard</Link>}
              <span className="hidden max-w-[180px] truncate text-[13px] text-ink-2 md:inline">{user.name}</span>
              <button
                type="button"
                onClick={async () => { await logout(); navigate({ to: '/login' }) }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-surface"
              >
                <LogOut size={14} /> Sign out
              </button>
            </>
          ) : (
            <Link to="/login" className="rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-600">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  )
}

function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-surface px-4 py-20 text-center">
      <span className="rounded-full bg-primary-050 px-3 py-1 text-xs font-semibold text-primary">404</span>
      <h1 className="text-2xl">That page does not exist</h1>
      <Link to="/" className="mt-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-600">Apply for delivery</Link>
    </div>
  )
}
