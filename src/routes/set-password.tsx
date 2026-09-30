import { useState, type FormEvent } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { CircleAlert, Eye, EyeOff, KeyRound } from 'lucide-react'
import { api, ApiError } from '#/lib/api'
import { useToast } from '#/lib/toast'
import { Button, Input, Notice } from '#/components/ui'

type Search = { token?: string }

export const Route = createFileRoute('/set-password')({
  validateSearch: (s: Record<string, unknown>): Search => ({ token: typeof s.token === 'string' && s.token ? s.token : undefined }),
  component: SetPasswordPage,
})

const MIN = 8

/** Opened from the set-password link UKO emails to the rider's company email (on approval, or from "Email me a set-password link"). */
function SetPasswordPage() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < MIN) return setError(`Use at least ${MIN} characters.`)
    if (password !== confirm) return setError('The two passwords do not match.')
    setBusy(true)
    try {
      const r = await api.post<{ ok: boolean; email: string }>('/auth/password/set', { token, password })
      toast.success(`Password set — sign in with ${r.email}`)
      navigate({ to: '/login' })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not set the password. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const eye = (
    <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="flex text-muted hover:text-ink">
      {show ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  )

  return (
    <div className="flex-1 bg-surface px-4 py-6 md:py-10">
      <div className="mx-auto flex max-w-[440px] flex-col gap-4 rounded-lg border border-border bg-bg p-5 md:p-[26px]">
        <div className="flex flex-col gap-1">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-050 text-primary"><KeyRound size={20} /></span>
          <h1 className="mt-2 text-[22px]">Set your password</h1>
          <p className="m-0 text-xs text-ink-2">This is the password for signing in to UKO delivery with your company email. At least {MIN} characters.</p>
        </div>
        {!token ? (
          <Notice tone="warning" icon={<CircleAlert size={14} />} title="This link is incomplete">
            Open the link from the email again, or ask for a new one on the <Link to="/login" className="font-semibold text-primary-600 hover:underline">sign-in page</Link>.
          </Notice>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Input label="New password" required type={show ? 'text' : 'password'} autoComplete="new-password" minLength={MIN} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} trailing={eye} />
            <Input label="Confirm password" required type={show ? 'text' : 'password'} autoComplete="new-password" minLength={MIN} placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <Button type="submit" size="lg" full loading={busy}>Set password</Button>
            {error && <Notice tone="danger" icon={<CircleAlert size={14} />}><span className="text-danger">{error}</span></Notice>}
          </form>
        )}
        <p className="m-0 text-center text-xs text-ink-2">
          Link expired? <Link to="/login" className="font-semibold text-primary-600 hover:underline">Ask for a new one</Link> on the sign-in page.
        </p>
      </div>
    </div>
  )
}
