/**
 * Shared component kit — mirrors the reusable frames in docs/wireframe.pen:
 * Button / Primary · Secondary · Outline, Chip, Badge / Verified, Form Field,
 * Card / Stat, Checkout Stepper, plus small helpers (Toggle, Qty stepper, code digits…).
 */
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Link } from '@tanstack/react-router'
import { Check, ChevronDown, Loader2, Minus, Plus, ShieldCheck, Star, TrendingDown, TrendingUp } from 'lucide-react'

export function cx(...parts: Array<string | boolean | number | bigint | null | undefined>): string {
  return parts.filter((p) => typeof p === 'string' && p).join(' ')
}

// ------------------------------------------------------------------ Buttons
type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-600 border border-primary hover:border-primary-600',
  secondary: 'bg-secondary text-white hover:bg-secondary-600 border border-secondary hover:border-secondary-600',
  outline: 'bg-transparent text-ink border border-border-strong hover:bg-surface',
  ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-surface hover:text-ink',
  danger: 'bg-danger text-white border border-danger hover:opacity-90',
}
const SIZE: Record<Size, string> = { sm: 'px-3.5 py-2 text-[13px]', md: 'px-[22px] py-[13px] text-sm', lg: 'px-7 py-3.5 text-[15px]' }

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode; full?: boolean }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', loading, icon, full, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx('inline-flex items-center justify-center gap-2 rounded-md font-semibold leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-60', VARIANT[variant], SIZE[size], full && 'w-full', className)}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="spin" /> : icon}
      {children}
    </button>
  )
})

/** Button-styled link. `to` = app route (TanStack <Link>); `href` = external URL such as the shelves app (plain <a>). */
export function LinkButton({ to, href, variant = 'primary', size = 'md', icon, full, className, children, search, params }: { to?: string; href?: string; variant?: Variant; size?: Size; icon?: ReactNode; full?: boolean; className?: string; children: ReactNode; search?: any; params?: any }) {
  const cls = cx('inline-flex items-center justify-center gap-2 rounded-md font-semibold leading-none transition-colors', VARIANT[variant], SIZE[size], full && 'w-full', className)
  if (href) return <a href={href} className={cls}>{icon}{children}</a>
  return (
    <Link to={to as any} search={search} params={params} className={cls}>
      {icon}
      {children}
    </Link>
  )
}

/** True for absolute http(s) URLs (links into another UKO app, e.g. SHELVES_URL) that must not go through the router. */
export const isExternalUrl = (to: string) => /^https?:\/\//i.test(to)

/** Plain text link for menus and lists that mix app routes with absolute URLs: `<a href>` for http(s), `<Link to>` otherwise. */
export function AppLink({ to, className, onClick, children }: { to: string; className?: string; onClick?: () => void; children: ReactNode }) {
  if (isExternalUrl(to)) return <a href={to} className={className} onClick={onClick}>{children}</a>
  return <Link to={to as any} className={className} onClick={onClick}>{children}</Link>
}

// ------------------------------------------------------------------ Chip / Badge
export function Chip({ children, active, onClick, tone = 'neutral', className, size = 'md', onRemove }: { children: ReactNode; active?: boolean; onClick?: () => void; tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'secondary'; className?: string; size?: 'sm' | 'md'; onRemove?: () => void }) {
  const tones: Record<string, string> = {
    neutral: active ? 'bg-primary text-white' : 'bg-surface-2 text-ink-2 hover:bg-border',
    primary: 'bg-primary-050 text-primary-600',
    success: 'bg-success-050 text-success',
    warning: 'bg-warning-050 text-warning',
    danger: 'bg-danger-050 text-danger',
    secondary: 'bg-secondary-050 text-secondary-600',
  }
  const Tag: any = onClick ? 'button' : 'span'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={cx('inline-flex items-center gap-1.5 rounded-full font-medium leading-none whitespace-nowrap', size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-[13px] py-[7px] text-xs', tones[tone], onClick && 'cursor-pointer transition-colors', className)}>
      {children}
      {onRemove && (
        <span role="button" onClick={(e) => { e.stopPropagation(); onRemove() }} className="ml-0.5 opacity-70 hover:opacity-100">×</span>
      )}
    </Tag>
  )
}

export function VerifiedBadge({ label = 'Verified', className }: { label?: string; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full bg-success-050 px-2.5 py-[5px] text-[11px] font-semibold leading-none text-success', className)}>
      <ShieldCheck size={13} /> {label}
    </span>
  )
}

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const tone = ({ unpaid: 'warning', processing: 'primary', ready: 'success', shipped: 'primary', completed: 'success', cancelled: 'danger', direct: 'warning', live: 'success', pending: 'warning', paused: 'neutral', sold_out: 'danger', draft: 'neutral', offered: 'warning', accepted: 'primary', picked_up: 'primary', collected: 'primary', on_the_way: 'primary', delivered: 'success', at_capacity: 'warning', suspended: 'danger', paid: 'success', released: 'success', approved: 'success', rejected: 'danger', failed: 'danger' } as Record<string, any>)[status] || 'neutral'
  const text = label || status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  return <Chip tone={tone} size="sm">{text}</Chip>
}

// ------------------------------------------------------------------ Form field
type FieldBase = { label?: string; hint?: string; error?: string; className?: string; required?: boolean }
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldBase & { trailing?: ReactNode; leading?: ReactNode }>(function Input({ label, hint, error, className, required, trailing, leading, ...rest }, ref) {
  const id = useId()
  return (
    <label htmlFor={id} className={cx('flex flex-col gap-[7px]', className)}>
      {label && <span className="text-xs font-semibold text-ink-2">{label}{required && <span className="text-danger"> *</span>}</span>}
      <span className={cx('flex items-center gap-2.5 rounded-md border bg-bg px-3.5 py-[11px] text-sm focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-050', error ? 'border-danger' : 'border-border')}>
        {leading && <span className="text-muted">{leading}</span>}
        <input ref={ref} id={id} className="w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-muted" {...rest} />
        {trailing && <span className="text-muted">{trailing}</span>}
      </span>
      {error ? <span className="text-xs text-danger">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  )
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldBase & { placeholder?: string }>(function Select({ label, hint, error, className, required, placeholder, children, ...rest }, ref) {
  const id = useId()
  return (
    <label htmlFor={id} className={cx('flex flex-col gap-[7px]', className)}>
      {label && <span className="text-xs font-semibold text-ink-2">{label}{required && <span className="text-danger"> *</span>}</span>}
      <span className={cx('relative flex items-center rounded-md border bg-bg text-sm focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-050', error ? 'border-danger' : 'border-border')}>
        <select ref={ref} id={id} className="w-full appearance-none bg-transparent px-3.5 py-[11px] pr-9 text-ink outline-none" {...rest}>
          {placeholder && <option value="">{placeholder}</option>}
          {children}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-3 text-muted" />
      </span>
      {error ? <span className="text-xs text-danger">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldBase>(function Textarea({ label, hint, error, className, required, ...rest }, ref) {
  const id = useId()
  return (
    <label htmlFor={id} className={cx('flex flex-col gap-[7px]', className)}>
      {label && <span className="text-xs font-semibold text-ink-2">{label}{required && <span className="text-danger"> *</span>}</span>}
      <textarea ref={ref} id={id} rows={3} className={cx('w-full rounded-md border bg-bg px-3.5 py-[11px] text-sm text-ink outline-none placeholder:text-muted focus:border-primary-300 focus:ring-2 focus:ring-primary-050', error ? 'border-danger' : 'border-border')} {...rest} />
      {error ? <span className="text-xs text-danger">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  )
})

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; className?: string }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-2.5 text-[13px] text-ink-2', className)}>
      <span onClick={() => onChange(!checked)} className={cx('mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors', checked ? 'border-primary bg-primary text-white' : 'border-border-strong bg-bg')}>
        {checked && <Check size={12} strokeWidth={3} />}
      </span>
      <span onClick={() => onChange(!checked)}>{label}</span>
    </label>
  )
}

export function Radio({ checked, onChange, className }: { checked: boolean; onChange?: () => void; className?: string }) {
  return (
    <span onClick={onChange} className={cx('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors', checked ? 'border-primary' : 'border-border-strong', className)}>
      {checked && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
    </span>
  )
}

export function Toggle({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; className?: string }) {
  return (
    <label className={cx('flex cursor-pointer items-center gap-3 text-[13px] text-ink-2', className)}>
      {label}
      <span role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cx('relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full transition-colors', checked ? 'bg-primary' : 'bg-border-strong')}>
        <span className={cx('absolute h-[18px] w-[18px] rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[20px]' : 'translate-x-[2px]')} />
      </span>
    </label>
  )
}

export function QtyStepper({ value, onChange, min = 1, max = 99, size = 'md' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; size?: 'sm' | 'md' }) {
  const h = size === 'sm' ? 'h-8' : 'h-10'
  return (
    <span className={cx('inline-flex items-stretch overflow-hidden rounded-md border border-border-strong bg-bg', h)}>
      <button type="button" aria-label="Decrease" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className="flex w-9 items-center justify-center text-ink-2 hover:bg-surface disabled:opacity-40"><Minus size={14} /></button>
      <span className="flex min-w-10 items-center justify-center border-x border-border-strong px-2 text-sm font-semibold">{value}</span>
      <button type="button" aria-label="Increase" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className="flex w-9 items-center justify-center text-ink-2 hover:bg-surface disabled:opacity-40"><Plus size={14} /></button>
    </span>
  )
}

export function CodeDigits({ value, length = 4, onChange, size = 'md' }: { value: string; length?: number; onChange?: (v: string) => void; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'h-14 w-12 text-2xl' : size === 'sm' ? 'h-9 w-8 text-base' : 'h-12 w-10 text-xl'
  const chars = Array.from({ length }, (_, i) => value[i] || '')
  if (!onChange) {
    return (
      <span className="inline-flex gap-2">
        {chars.map((c, i) => <span key={i} className={cx('flex items-center justify-center rounded-md border border-border-strong bg-surface font-head font-extrabold text-ink', dims)}>{c}</span>)}
      </span>
    )
  }
  return (
    <span className="inline-flex gap-2">
      {chars.map((c, i) => (
        <input
          key={i}
          value={c}
          inputMode="numeric"
          maxLength={1}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, '').slice(-1)
            const next = chars.slice()
            next[i] = d
            onChange(next.join(''))
            if (d) (e.target.nextElementSibling as HTMLInputElement | null)?.focus()
          }}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !c) (e.currentTarget.previousElementSibling as HTMLInputElement | null)?.focus() }}
          className={cx('rounded-md border border-border-strong bg-bg text-center font-head font-extrabold text-ink outline-none focus:border-primary', dims)}
        />
      ))}
    </span>
  )
}

// ------------------------------------------------------------------ Cards & content
export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={cx('rounded-lg border border-border bg-bg', padded && 'p-5', className)}>{children}</div>
}

export function StatCard({ label, value, trend, trendDown, className }: { label: string; value: ReactNode; trend?: string; trendDown?: boolean; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-1.5 rounded-md border border-border bg-bg p-4', className)}>
      <span className="text-xs text-ink-2">{label}</span>
      <span className="font-head text-[26px] font-extrabold leading-tight text-ink">{value}</span>
      {trend && (
        <span className={cx('flex items-center gap-1 text-[11px]', trendDown ? 'text-danger' : 'text-success')}>
          {trendDown ? <TrendingDown size={13} /> : <TrendingUp size={13} />} {trend}
        </span>
      )}
    </div>
  )
}

export function SectionHead({ title, sub, action, className }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] leading-tight md:text-2xl">{title}</h2>
        {sub && <p className="m-0 text-[13px] text-ink-2">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageTitle({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] leading-tight md:text-[30px]">{title}</h1>
        {sub && <p className="m-0 text-sm text-ink-2">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function Stars({ value, size = 12, count }: { value: number; size?: number; count?: number | string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={size} className={n <= Math.round(value) ? 'fill-secondary text-secondary' : 'fill-border-strong text-border-strong'} />)}
      {count !== undefined && <span className="ml-0.5 text-[11px] text-muted">{value ? value.toFixed(1) : '—'} ({count})</span>}
    </span>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { key: T; label: ReactNode; count?: number }[]; value: T; onChange: (k: T) => void; className?: string }) {
  return (
    <div className={cx('no-scrollbar flex gap-1 overflow-x-auto border-b border-border', className)}>
      {tabs.map((t) => (
        <button key={t.key} type="button" onClick={() => onChange(t.key)} className={cx('-mb-px whitespace-nowrap border-b-2 px-3 py-3 text-[13px] font-medium transition-colors', value === t.key ? 'border-primary text-primary' : 'border-transparent text-ink-2 hover:text-ink')}>
          {t.label}
          {t.count !== undefined && <span className={cx('ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]', value === t.key ? 'bg-primary-050 text-primary' : 'bg-surface-2 text-muted')}>{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-surface-2', className)} />
}

export function EmptyState({ icon, title, sub, action, tag }: { icon: ReactNode; title: string; sub?: string; action?: ReactNode; tag?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      {tag && <Chip size="sm" tone="primary">{tag}</Chip>}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-050 text-primary">{icon}</div>
      <h3 className="text-lg">{title}</h3>
      {sub && <p className="m-0 max-w-sm text-[13px] text-ink-2">{sub}</p>}
      {action}
    </div>
  )
}

export function Notice({ tone = 'warning', icon, title, children, action, className }: { tone?: 'warning' | 'info' | 'success' | 'danger'; icon?: ReactNode; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const t = { warning: 'border-warning/30 bg-warning-050 text-warning', info: 'border-primary-300 bg-primary-050 text-primary-600', success: 'border-success/30 bg-success-050 text-success', danger: 'border-danger/30 bg-danger-050 text-danger' }[tone]
  return (
    <div className={cx('flex items-start gap-3 rounded-md border px-4 py-3', t, className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="flex-1 text-[13px]">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cx(title && 'mt-0.5', 'text-ink-2')}>{children}</div>}
      </div>
      {action}
    </div>
  )
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cx('m-0 border-0 border-t border-border', className)} />
}

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string; size?: number; className?: string }) {
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')
  return src ? (
    <img src={src} alt={name} style={{ width: size, height: size }} className={cx('rounded-full object-cover', className)} />
  ) : (
    <span style={{ width: size, height: size, fontSize: size * 0.36 }} className={cx('grad-brand inline-flex shrink-0 items-center justify-center rounded-full font-head font-bold text-white', className)}>{ini}</span>
  )
}

/** Checkout Stepper — Cart · Shelf & delivery · Payment · Confirmation */
export function CheckoutStepper({ step }: { step: 1 | 2 | 3 | 4 }) {
  const steps = ['Cart', 'Shelf & delivery', 'Payment', 'Confirmation']
  return (
    <div className="border-b border-border bg-bg">
      <div className="container-x flex h-[64px] items-center gap-2 md:h-[72px] md:gap-3.5">
        {steps.map((s, i) => {
          const n = i + 1
          const done = n < step
          const active = n === step
          return (
            <div key={s} className="contents">
              <div className="flex items-center gap-2 md:gap-[9px]">
                <span className={cx('flex h-[26px] w-[26px] items-center justify-center rounded-full text-xs font-bold', active || done ? 'bg-primary text-white' : 'bg-surface-2 text-muted')}>{done ? <Check size={13} strokeWidth={3} /> : n}</span>
                <span className={cx('text-[13px]', active ? 'font-bold text-ink' : done ? 'font-medium text-ink-2' : 'font-medium text-muted', 'hidden sm:inline')}>{s}</span>
                <span className={cx('text-[12px] sm:hidden', active ? 'font-bold text-ink' : 'text-muted')}>{s.split(' ')[0]}</span>
              </div>
              {i < steps.length - 1 && <span className={cx('h-0.5 flex-1 rounded-full', done ? 'bg-primary' : 'bg-surface-2')} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Breadcrumbs({ crumbs }: { crumbs: { name: string; href: string }[] }) {
  return (
    <nav className="no-scrollbar flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-xs text-muted">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span>›</span>}
          {i < crumbs.length - 1 && c.href !== '#' ? <Link to={c.href as any} className="hover:text-primary">{c.name}</Link> : <span className={i === crumbs.length - 1 ? 'font-medium text-ink' : ''}>{c.name}</span>}
        </span>
      ))}
    </nav>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 size={18} className={cx('spin text-primary', className)} />
}

export function PageLoading() {
  return <div className="flex items-center justify-center gap-2 py-24 text-sm text-ink-2"><Spinner /> Loading…</div>
}

export function KeyValue({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 text-[13px]">
      <span className="text-ink-2">{label}</span>
      <span className={cx('text-right', strong ? 'font-head text-base font-extrabold text-ink' : 'font-medium text-ink')}>{value}</span>
    </div>
  )
}

export function ProgressBar({ value, className, tone = 'primary' }: { value: number; className?: string; tone?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' }) {
  const c = { primary: 'bg-primary', secondary: 'bg-secondary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tone]
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)}>
      <div className={cx('h-full rounded-full', c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}
