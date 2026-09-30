/** On-route safety: the keep-your-phone-on banner and the live-tracking link the rider shares. */
import { useEffect, useState } from 'react'
import { BatteryCharging, Copy, ExternalLink, Link2, MapPin, Share2, Smartphone } from 'lucide-react'
import { useToast } from '#/lib/toast'
import { cx } from './ui'

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ago`
}

/**
 * Shown on every job in hand. The phone is the only way UKO knows where a parcel is: when it goes quiet for
 * `warnMinutes` the rider is asked to reopen the app, after `missingMinutes` the delivery team is alerted and may
 * report the rider to the police with his documents.
 */
export function KeepPhoneOn({ awake, lastSent, warnMinutes = 10, missingMinutes = 30 }: { awake: boolean; lastSent: number | null; warnMinutes?: number; missingMinutes?: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5_000)
    return () => window.clearInterval(t)
  }, [])
  const quiet = lastSent != null && now - lastSent > 2 * 60_000
  return (
    <div className={cx('flex flex-col gap-2 rounded-md border p-3.5', quiet ? 'border-danger bg-danger-050' : 'border-warning bg-warning-050')} role="status">
      <div className="flex items-start gap-2.5">
        <Smartphone size={18} className={cx('mt-0.5 shrink-0', quiet ? 'text-danger' : 'text-warning')} />
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-bold text-ink">Keep your phone ON, charged and this page open until the drop</span>
          <span className="text-[11px] leading-relaxed text-ink-2">
            Your location is tracked for the whole route and shared with the buyer and UKO. Do not switch the phone off, turn on flight
            mode or close this page. After {warnMinutes} minutes without a signal we ask you to reopen the app; after {missingMinutes} minutes
            the delivery team is alerted and a rider who cannot be reached with a parcel is reported to the police using his registration documents.
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 pl-7 text-[10px] font-semibold">
        <span className={awake ? 'text-success' : 'text-muted'}>{awake ? '● Screen kept awake' : '○ Screen may sleep — keep this page in front'}</span>
        <span className={quiet ? 'text-danger' : lastSent ? 'text-success' : 'text-muted'}>
          {lastSent ? `● Last location sent ${ago(now - lastSent)}` : '○ Waiting for the first location'}
        </span>
        <span className="flex items-center gap-1 text-muted"><BatteryCharging size={11} /> Plug in a power bank on long runs</span>
      </div>
    </div>
  )
}

/**
 * The public live-tracking link for this job, plus Google Maps links to where the rider is right now. Anyone with the
 * link sees the rider move and can open directions to him in Google Maps.
 */
export function TrackingLinkCard({ url, me, trackingNo }: { url?: string; me: { lat: number; lng: number } | null; trackingNo: string }) {
  const toast = useToast()
  if (!url) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Tracking link copied')
    } catch {
      toast.error('Could not copy — press and hold the link to copy it')
    }
  }
  const share = async () => {
    const nav = navigator as any
    if (nav.share) {
      try { await nav.share({ title: `UKO delivery ${trackingNo}`, text: `Follow delivery ${trackingNo} live`, url }) } catch {}
    } else copy()
  }
  const btn = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold text-ink hover:bg-bg'
  return (
    <div className="flex flex-col gap-2.5 rounded-md bg-surface p-3.5">
      <div className="flex items-center gap-2">
        <Link2 size={15} className="text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Live GPS tracking link</span>
      </div>
      <a href={url} target="_blank" rel="noreferrer" className="break-all text-[11px] font-semibold text-primary-600 hover:underline">{url}</a>
      <span className="text-[10px] leading-relaxed text-muted">Anyone with this link follows you on the map and can open directions to you in Google Maps. Buyers are sent it when you accept their order.</span>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={copy}><Copy size={12} /> Copy</button>
        <button type="button" className={btn} onClick={share}><Share2 size={12} /> Share</button>
        <a className={btn} href={`https://wa.me/?text=${encodeURIComponent(`Follow UKO delivery ${trackingNo} live: ${url}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        {me && (
          <a className={btn} href={`https://www.google.com/maps/search/?api=1&query=${me.lat},${me.lng}`} target="_blank" rel="noreferrer">
            <MapPin size={12} /> My position in Google Maps <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  )
}

