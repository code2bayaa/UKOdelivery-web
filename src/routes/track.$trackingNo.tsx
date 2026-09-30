import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CircleCheck, ExternalLink, MapPin, Navigation, Radio, TriangleAlert } from 'lucide-react'
import { api, type PublicTrack } from '#/lib/api'
import { Card, Chip, Notice, PageLoading, StatusPill } from '#/components/ui'
import { MapView, type MapPoint } from '#/components/map'

/**
 * Public live tracking of a delivery — the link riders share and buyers are sent: /track/DLV-12345?t=<token>.
 * No sign-in; the token in the link is the key. Refreshes every 10 s while the job is live and opens the rider's
 * position, or directions to him, in Google Maps.
 */
type Search = { t?: string }

export const Route = createFileRoute('/track/$trackingNo')({
  validateSearch: (s: Record<string, unknown>): Search => ({ t: typeof s.t === 'string' ? s.t : undefined }),
  component: TrackPage,
})

const POLL_MS = 10_000

function TrackPage() {
  const { trackingNo } = Route.useParams()
  const { t } = Route.useSearch()
  const [data, setData] = useState<PublicTrack | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    const get = () => api.get<PublicTrack>(`/track/${encodeURIComponent(trackingNo)}`, { t })
      .then((d) => { if (alive) { setData(d); setErr('') } })
      .catch((e) => { if (alive) setErr(e.message || 'This tracking link is not valid') })
    get()
    const id = window.setInterval(get, POLL_MS)
    return () => { alive = false; window.clearInterval(id) }
  }, [trackingNo, t])

  if (err && !data) {
    return <div className="mx-auto w-full max-w-[720px] px-4 py-10"><Notice tone="danger" icon={<TriangleAlert size={16} />} title="Tracking link not valid">{err.replace(/\.$/, '')}. Ask the rider or UKO for a fresh link.</Notice></div>
  }
  if (!data) return <PageLoading />

  const pos = data.position
  const points: MapPoint[] = []
  if (data.origin) points.push({ id: 'origin', lat: data.origin.lat, lng: data.origin.lng, label: data.origin.label, tone: 'success' })
  if (pos) points.push({ id: 'rider', lat: pos.lat, lng: pos.lng, label: data.rider ? `${data.rider.name} · ${data.rider.plate}` : 'Rider', tone: 'primary' })
  if (data.destination) points.push({ id: 'dest', lat: data.destination.lat, lng: data.destination.lng, label: data.destination.label || 'Drop', tone: 'secondary' })
  const onward = pos && data.destination
    ? `https://www.google.com/maps/dir/?api=1&origin=${pos.lat},${pos.lng}&destination=${data.destination.lat},${data.destination.lng}&travelmode=driving`
    : ''
  const seen = pos?.seconds_ago == null ? '' : pos.seconds_ago < 60 ? `${pos.seconds_ago} s ago` : `${Math.floor(pos.seconds_ago / 60)} min ago`
  const btn = 'inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold'

  return (
    <div className="flex-1 bg-surface px-4 py-6 md:py-8">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">{data.kind === 'pickup' ? `Live item pick-up${data.item ? ` · ${data.item}` : ''} · seller → shelf` : 'Live delivery tracking'}</span>
            <h1 className="text-2xl">{data.tracking_no}</h1>
            <span className="text-[13px] text-ink-2">
              {data.rider ? `${data.rider.name} · ${data.rider.plate || data.rider.vehicle}` : 'Rider'}{data.eta ? ` · ETA ${data.eta}` : ''}{data.window ? ` · window ${data.window}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {data.live && <Chip size="sm" tone={data.signal === 'lost' ? 'danger' : 'success'}><Radio size={11} /> {data.signal === 'lost' ? 'Signal lost' : 'Live'}</Chip>}
            <StatusPill status={data.status} />
          </div>
        </div>

        {!data.live ? (
          <Notice tone={data.status === 'delivered' ? 'success' : 'info'} icon={<CircleCheck size={16} />} title={data.status === 'delivered' ? (data.kind === 'pickup' ? 'Checked in at the shelf' : 'Delivered') : 'Not on route'}>
            {data.status === 'delivered'
              ? (data.kind === 'pickup' ? 'The shelf has checked the item in — live tracking has stopped.' : 'This delivery is complete — live tracking has stopped.')
              : 'Tracking starts again when a rider takes the job.'}
          </Notice>
        ) : data.signal === 'lost' ? (
          <Notice tone="danger" icon={<TriangleAlert size={16} />} title="The rider's phone has stopped reporting">
            The last known position is shown below. The UKO delivery team has been alerted and is contacting the rider — call 0700 000 111 if you need help.
          </Notice>
        ) : null}

        <Card padded={false} className="overflow-hidden">
          <MapView points={points} line follow="rider" height={420} hint={!pos ? (data.live ? 'Waiting for the rider\'s first location…' : undefined) : undefined} />
        </Card>

        {pos && (
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
              <MapPin size={14} className="text-primary" />
              <span className="font-semibold text-ink">{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</span>
              {pos.accuracy != null && <span>± {Math.round(pos.accuracy)} m</span>}
              {seen && <span>· updated {seen}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={pos.maps_url} target="_blank" rel="noreferrer" className={`${btn} border border-border-strong text-ink hover:bg-surface`}><MapPin size={13} /> Rider in Google Maps <ExternalLink size={11} /></a>
              <a href={pos.directions_url} target="_blank" rel="noreferrer" className={`${btn} bg-primary text-white hover:bg-primary-600`}><Navigation size={13} /> Directions to the rider <ExternalLink size={11} /></a>
              {onward && <a href={onward} target="_blank" rel="noreferrer" className={`${btn} border border-border-strong text-ink hover:bg-surface`}><Navigation size={13} /> Rider's route to the drop <ExternalLink size={11} /></a>}
            </div>
          </Card>
        )}
        <span className="text-center text-[11px] text-muted">Refreshes every 10 seconds · UKO delivery · 0700 000 111</span>
      </div>
    </div>
  )
}
