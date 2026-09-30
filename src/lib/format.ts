export function ksh(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  if (opts.compact && Math.abs(n) >= 1000) return `KSh ${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k`
  return `KSh ${Math.round(n).toLocaleString('en-KE')}`
}

export function priceRange(min: number, max: number): string {
  if (!max || max === min) return ksh(min)
  return `KSh ${Math.round(min).toLocaleString('en-KE')} – ${Math.round(max).toLocaleString('en-KE')}`
}

export function num(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('en-KE')
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`
  if (diff < 86400 * 2) return 'yesterday'
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} days ago`
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
}

export function fmtDate(iso: string | null | undefined, withTime = true): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-KE', { day: 'numeric', month: 'short', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) })
}

export function discountPct(oldAmount: number | null | undefined, amount: number): number {
  if (!oldAmount || oldAmount <= amount) return 0
  return Math.round((1 - amount / oldAmount) * 100)
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('')
}

export const STATUS_LABEL: Record<string, string> = {
  unpaid: 'Unpaid',
  processing: 'Processing',
  ready: 'Ready at shelf',
  shipped: 'Shipped',
  completed: 'Completed',
  cancelled: 'Cancelled',
  direct: 'Bought directly from seller',
  live: 'Live',
  pending: 'Pending verification',
  paused: 'Paused',
  sold_out: 'Sold out',
  draft: 'Draft',
  offered: 'Offered',
  accepted: 'Accepted',
  picked_up: 'Picked up',
  collected: 'Collected',
  on_the_way: 'On the way',
  delivered: 'Delivered',
  at_capacity: 'At capacity',
  suspended: 'Suspended',
  open: 'Open',
  closed: 'Closed',
  resolved: 'Resolved',
  submitted: 'Submitted',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  paid: 'Paid',
}

export const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'primary' | 'neutral'> = {
  unpaid: 'warning', processing: 'primary', ready: 'success', shipped: 'primary', completed: 'success', cancelled: 'danger', direct: 'warning',
  live: 'success', pending: 'warning', paused: 'neutral', sold_out: 'danger', draft: 'neutral', offered: 'warning', accepted: 'primary',
  picked_up: 'primary', collected: 'primary', on_the_way: 'primary', delivered: 'success', at_capacity: 'warning', suspended: 'danger',
  open: 'warning', closed: 'neutral', resolved: 'success',
  submitted: 'warning', under_review: 'primary', approved: 'success', rejected: 'danger', paid: 'success',
}
