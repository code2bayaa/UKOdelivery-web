import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Check, CircleAlert, Eye, EyeOff, KeyRound, MailCheck, MapPin } from 'lucide-react'
import { api, ApiError, type LoginCodeResponse, type Me, type PasswordLinkResponse } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useToast } from '#/lib/toast'
import { hasLocationConsent, requestLocation, setLocationConsent } from '#/lib/location'
import { Button, Checkbox, Input, Notice } from '#/components/ui'

type Search = { next?: string }

export const Route = createFileRoute('/login')({
  validateSearch: (s: Record<string, unknown>): Search => ({ next: typeof s.next === 'string' && s.next.startsWith('/') ? s.next : undefined }),
  component: LoginPage,
})

const BENEFITS = [
  'Apply first — no account needed to send an application',
  'Once approved, sign in with the company email UKO gives you',
  'See jobs offered from shelves in your wards',
  'Confirm pickups and drops with hand-off codes',
  'Withdraw delivery fees to M-PESA',
]

function landing(u: Me, next?: string): string {
  if (next) return next
  return u.is_rider ? '/dashboard' : '/'
}

type Step = 'password' | 'code' | 'link'

function LoginPage() {
  const navigate = useNavigate()
  const { next } = Route.useSearch()
  const { requestCode, login, user, ready } = useAuth()
  const toast = useToast()
  const [step, setStep] = useState<Step>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [track, setTrack] = useState(hasLocationConsent)
  const [sent, setSent] = useState<LoginCodeResponse | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const [linkSent, setLinkSent] = useState<PasswordLinkResponse | null>(null)

  useEffect(() => {
    if (ready && user) navigate({ to: landing(user, next) as any })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user])

  // Resend countdown for the e-mailed code.
  useEffect(() => {
    if (resendIn <= 0) return
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [resendIn])

  const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback)

  const askCode = async () => {
    setError('')
    setBusy(true)
    try {
      const r = await requestCode(email.trim(), password)
      setSent(r)
      setCode('')
      setResendIn(r.resend_in || 60)
      setStep('code')
    } catch (err) {
      setError(message(err, 'Could not sign in. Check your connection and try again.'))
    } finally {
      setBusy(false)
    }
  }

  const submitPassword = (e: FormEvent) => {
    e.preventDefault()
    if (!track) return setError('Accept location tracking to sign in — buyers and shelves follow your position while you deliver.')
    askCode()
  }

  const submitCode = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from the email.')
    setBusy(true)
    // Asked inside the click so the browser shows its prompt.
    const located = requestLocation()
    try {
      const u = await login(email.trim(), password, code.trim())
      setLocationConsent(true)
      if ((await located) === 'denied') toast.error('Location is blocked for this site — allow it in the browser before taking jobs')
      toast.success(`Welcome back, ${u.name.split(' ')[0]}`)
      navigate({ to: landing(u, next) as any })
    } catch (err) {
      setError(message(err, 'Could not sign in. Check your connection and try again.'))
    } finally {
      setBusy(false)
    }
  }

  const sendLink = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) return setError('Enter your company email.')
    setBusy(true)
    try {
      setLinkSent(await api.post<PasswordLinkResponse>('/auth/password/link', { email: email.trim() }))
    } catch (err) {
      setError(message(err, 'Could not send the link. Check your connection and try again.'))
    } finally {
      setBusy(false)
    }
  }

  const goTo = (s: Step) => {
    setError('')
    setLinkSent(null)
    setStep(s)
  }

  const errorBox = error && <Notice tone="danger" icon={<CircleAlert size={14} />}><span className="text-danger">{error}</span></Notice>

  return (
    <div className="flex-1 bg-surface px-4 py-6 md:py-10">
      <div className="mx-auto flex max-w-[860px] flex-col gap-6 md:flex-row md:items-stretch md:gap-7">
        <div className="order-1 flex flex-1 flex-col gap-4 rounded-lg border border-border bg-bg p-5 md:order-2 md:p-[26px]">
          {step === 'password' && (
            <form onSubmit={submitPassword} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h1 className="text-[22px]">Rider sign in</h1>
                <p className="m-0 text-xs text-ink-2">Use the company email UKO assigned when your application was approved. We email you a 6-digit code to finish signing in.</p>
              </div>
              <Input label="Company email" required type="email" autoComplete="username" placeholder="you@uko.co.ke" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input
                label="Password"
                required
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                trailing={<button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="flex text-muted hover:text-ink">{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>}
              />
              <div className="rounded-md border border-border bg-surface p-3">
                <Checkbox
                  checked={track}
                  onChange={setTrack}
                  label={<span className="flex items-start gap-1.5 text-[11px] leading-relaxed"><MapPin size={13} className="mt-0.5 shrink-0 text-primary" /><span>I accept location tracking. UKO reads my position while I am signed in and shares it with the buyer and the shelf while I am on route with their parcel.</span></span>}
                />
              </div>
              <Button type="submit" size="lg" full loading={busy} disabled={!track}>Continue</Button>
              {errorBox}
              <p className="m-0 text-center text-xs text-ink-2">
                First time here or forgot your password?{' '}
                <button type="button" onClick={() => goTo('link')} className="font-semibold text-primary-600 hover:underline">Email me a set-password link</button>
              </p>
              <p className="m-0 text-center text-xs text-ink-2">
                Not a delivery partner yet? <Link to="/" className="font-semibold text-primary-600 hover:underline">Apply first</Link> — once approved, UKO emails a set-password link to your company email.
              </p>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={submitCode} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h1 className="text-[22px]">Enter your sign-in code</h1>
                <p className="m-0 text-xs text-ink-2">
                  {sent?.simulated ? 'Email is not set up on this server, so the code was not sent.' : <>We emailed a 6-digit code to <strong className="text-ink">{sent?.to}</strong>.</>} It expires in {Math.round((sent?.expires_in ?? 600) / 60)} minutes.
                </p>
              </div>
              {sent?.simulated && sent.code && (
                <Notice tone="info" icon={<KeyRound size={14} />} title="Simulation mode">
                  No email was sent. Your code is <strong className="font-mono tracking-[3px] text-ink">{sent.code}</strong>.
                </Notice>
              )}
              <Input
                label="6-digit code"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
              />
              <Button type="submit" size="lg" full loading={busy}>Sign in</Button>
              {errorBox}
              <div className="flex items-center justify-between gap-3 text-xs">
                <button type="button" onClick={() => goTo('password')} className="inline-flex items-center gap-1 text-ink-2 hover:text-ink"><ArrowLeft size={13} /> Back</button>
                {resendIn > 0 ? (
                  <span className="text-muted">Resend code in {resendIn}s</span>
                ) : (
                  <button type="button" disabled={busy} onClick={askCode} className="font-semibold text-primary-600 hover:underline disabled:opacity-50">Resend code</button>
                )}
              </div>
            </form>
          )}

          {step === 'link' && (
            <form onSubmit={sendLink} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h1 className="text-[22px]">Get a set-password link</h1>
                <p className="m-0 text-xs text-ink-2">First time signing in, or forgot your password? Enter your company email and we email you a link to set a new password. It works once and expires in 1 hour.</p>
              </div>
              {linkSent ? (
                <Notice tone="success" icon={<MailCheck size={14} />} title="Check your inbox">
                  If {linkSent.to} belongs to a UKO delivery partner, a set-password link is on its way. No email after a few minutes? Call the delivery team on <a href="tel:0700000111" className="font-semibold text-primary-600">0700 000 111</a>.
                </Notice>
              ) : (
                <>
                  <Input label="Company email" required type="email" autoComplete="username" placeholder="you@uko.co.ke" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <Button type="submit" size="lg" full loading={busy}>Email me the link</Button>
                </>
              )}
              {errorBox}
              <button type="button" onClick={() => goTo('password')} className="inline-flex items-center justify-center gap-1 text-xs text-ink-2 hover:text-ink"><ArrowLeft size={13} /> Back to sign in</button>
            </form>
          )}
        </div>
        <aside className="grad-hero order-2 flex w-full flex-col justify-between gap-8 rounded-[20px] p-6 text-white md:order-1 md:min-h-[460px] md:w-[360px] md:shrink-0 md:p-7">
          <div className="flex flex-col gap-3.5">
            <span className="font-head text-xl font-extrabold">UKO delivery</span>
            <h2 className="text-[24px] leading-[1.2] text-white md:text-[28px]">Short routes.<br />Fixed rates. Weekly payouts.</h2>
          </div>
          <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
            {BENEFITS.map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-white/80">
                <Check size={16} className="mt-0.5 shrink-0 text-secondary" /> {t}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}
