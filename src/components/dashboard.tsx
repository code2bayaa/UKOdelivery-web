/** Sidebar + main shell of the rider dashboard (same shell design as the UKO shop consoles). */
import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { Chip, Toggle, cx } from './ui'

export type NavItem = { key: string; label: string; icon: LucideIcon; badge?: number | string }

export function DashboardShell({ brand, nav, active, onSelect, toggle, cta, children }: { brand: ReactNode; nav: NavItem[]; active: string; onSelect: (k: string) => void; toggle?: { label: string; checked: boolean; onChange: (v: boolean) => void }; cta?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-h-[calc(100vh-57px)] w-full bg-surface">
      <aside className="hidden w-[260px] shrink-0 flex-col gap-1 border-r border-border bg-bg px-3.5 py-4 lg:flex">
        <div className="mb-3 px-2 pb-3.5 border-b border-border">{brand}</div>
        {nav.map((n) => (
          <button key={n.key} type="button" onClick={() => onSelect(n.key)} className={cx('flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-[13px] font-medium transition-colors', active === n.key ? 'bg-primary-050 text-primary' : 'text-ink-2 hover:bg-surface hover:text-ink')}>
            <n.icon size={17} /> <span className="flex-1">{n.label}</span>
            {n.badge !== undefined && n.badge !== 0 && <Chip size="sm" tone={active === n.key ? 'primary' : 'neutral'}>{n.badge}</Chip>}
          </button>
        ))}
        <div className="mt-auto flex flex-col gap-3 pt-4">
          {toggle && <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5 text-[13px]"><span className="font-medium">{toggle.label}</span><Toggle checked={toggle.checked} onChange={toggle.onChange} /></div>}
          {cta}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border bg-bg px-4 py-2 lg:hidden">
          <div className="min-w-0 flex-1">{brand}</div>
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 rounded-md border border-border-strong px-3 py-1.5 text-[13px] font-semibold">Menu <ChevronDown size={14} className={cx('transition-transform', open && 'rotate-180')} /></button>
        </div>
        {open && (
          <div className="grid grid-cols-2 gap-1 border-b border-border bg-bg p-2 lg:hidden">
            {nav.map((n) => (
              <button key={n.key} type="button" onClick={() => { onSelect(n.key); setOpen(false) }} className={cx('flex items-center gap-2 rounded-md px-3 py-2 text-left text-[13px]', active === n.key ? 'bg-primary-050 text-primary' : 'text-ink-2')}>
                <n.icon size={15} /> {n.label} {n.badge ? <Chip size="sm">{n.badge}</Chip> : null}
              </button>
            ))}
            {toggle && <div className="col-span-2 flex items-center justify-between px-3 py-2 text-[13px]"><span>{toggle.label}</span><Toggle checked={toggle.checked} onChange={toggle.onChange} /></div>}
          </div>
        )}
        <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 md:px-7 md:py-7 pb-24 md:pb-10">{children}</main>
      </div>
    </div>
  )
}

export function DashHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl md:text-[28px]">{title}</h1>
        {sub && <p className="m-0 text-[13px] text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ title, sub, action, children, className, padded = true }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx('flex flex-col rounded-lg border border-border bg-bg', className)}>
      {(title || action) && (
        <div className={cx('flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4')}>
          <div className="flex flex-col gap-0.5">
            {title && <h3 className="text-[15px] font-bold">{title}</h3>}
            {sub && <p className="m-0 text-xs text-ink-2">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cx(padded && 'p-5')}>{children}</div>
    </section>
  )
}

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cx('w-full overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
            {head.map((h, i) => <th key={i} className="px-4 py-2.5 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  )
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx('px-4 py-3 align-middle', className)}>{children}</td>
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return <Link to={to as any} className="text-[13px] text-ink-2 hover:text-primary">‹ {label}</Link>
}
