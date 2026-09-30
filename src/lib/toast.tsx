import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'

type Tone = 'success' | 'error' | 'info'
type Position = 'bottom' | 'top'
type Toast = { id: number; text: string; tone: Tone; position: Position }
type Options = { position?: Position; duration?: number }
type ToastCtx = {
  toast: (text: string, tone?: Tone, opts?: Options) => void
  success: (t: string, opts?: Options) => void
  error: (t: string, opts?: Options) => void
  /** Centre-top alert, used for form validation ("… must not be empty"). */
  alert: (t: string, tone?: Tone) => void
}

const Ctx = createContext<ToastCtx | null>(null)

function ToastCard({ t, onClose }: { t: Toast; onClose: () => void }) {
  return (
    <div
      role={t.tone === 'error' ? 'alert' : 'status'}
      className={`fade-up pointer-events-auto flex max-w-md items-start gap-2 rounded-md border px-3.5 py-2.5 text-[13px] shadow-card ${
        t.tone === 'success' ? 'border-success/30 bg-success-050 text-success' : t.tone === 'error' ? 'border-danger/30 bg-danger-050 text-danger' : 'border-border bg-bg text-ink'
      }`}
    >
      {t.tone === 'success' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : t.tone === 'error' ? <CircleAlert size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0" />}
      <span>{t.text}</span>
      <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100" aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const toast = useCallback((text: string, tone: Tone = 'info', opts: Options = {}) => {
    const id = Date.now() + Math.random()
    const position = opts.position ?? 'bottom'
    setItems((s) => [...s.filter((x) => !(position === 'top' && x.position === 'top' && x.text === text)), { id, text, tone, position }])
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), opts.duration ?? 4200)
  }, [])
  const value = useMemo<ToastCtx>(() => ({
    toast,
    success: (t, opts) => toast(t, 'success', opts),
    error: (t, opts) => toast(t, 'error', opts),
    alert: (t, tone = 'error') => toast(t, tone, { position: 'top', duration: 3600 }),
  }), [toast])
  const close = (id: number) => setItems((s) => s.filter((x) => x.id !== id))
  return (
    <Ctx.Provider value={value}>
      {children}
      {/* centre-top alerts (validation) */}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[110] flex flex-col items-center gap-2 px-4">
        {items.filter((t) => t.position === 'top').map((t) => <ToastCard key={t.id} t={t} onClose={() => close(t.id)} />)}
      </div>
      {/* bottom notifications */}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {items.filter((t) => t.position === 'bottom').map((t) => <ToastCard key={t.id} t={t} onClose={() => close(t.id)} />)}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useToast outside ToastProvider')
  return v
}
