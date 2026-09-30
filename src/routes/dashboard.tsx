import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Banknote, Camera, CircleCheck, ClipboardList, ExternalLink, Flag, House, Inbox, KeyRound, Map as MapIcon, MapPin, MessageSquare, Navigation, Package, PenLine, Phone, Plus, ShieldCheck, Store, Trash2, TriangleAlert, Truck, Undo2, User as UserIcon, UserX, Users } from 'lucide-react'
import { api, type Delivery, type PickupJob, type Rider } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useToast } from '#/lib/toast'
import { fmtDate, ksh } from '#/lib/format'
import { useLocationPermission, useRiderLocation, useWakeLock, type LocationState } from '#/lib/location'
import { Button, Chip, CodeDigits, EmptyState, Input, LinkButton, Notice, PageLoading, StatCard, StatusPill, Tabs, Textarea, cx } from '#/components/ui'
import { DashHeader, DashboardShell, Panel, Table, Td, type NavItem } from '#/components/dashboard'
import { Thumb } from '#/components/media'
import { MapView, type MapPoint } from '#/components/map'
import { WalletPanel } from '#/components/wallet'
import { MessagesPanel, type MessageTarget } from '#/components/messages'
import { ReportPanel } from '#/components/report'
import { KeepPhoneOn, TrackingLinkCard } from '#/components/tracking'
import { InsurancePanel } from '#/components/insurance'

export const Route = createFileRoute('/dashboard')({ component: DeliveryPage })

// ---------------------------------------------------------------- types (GET /api/rider/dashboard)
/** `earnings_week` is what reached his wallet — trip fees less UKO's `commission_pct` (10 %). */
type Stats = { deliveries_today: number; earnings_week: number; commission_pct: number; on_time_rate: number; rating: number; active_jobs: number; wallet: number; current_job?: string | null }
type Offered = Delivery & { expires_in: number }
/** Seller -> shelf item trips, next to the buyer deliveries. */
type Pickups = { offered: PickupJob[]; active: PickupJob[]; completed: PickupJob[] }
type Dash = { rider: Rider; stats: Stats; active: Delivery[]; offered: Offered[]; completed: Delivery[]; pickups: Pickups }
type Section = 'orders' | 'route' | 'messages' | 'wallet' | 'area' | 'profile' | 'report' | 'insurance' | 'cancel'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const POLL_MS = 15_000

function DeliveryPage() {
  const { user, ready } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [data, setData] = useState<Dash | null>(null)
  const [fetchedAt, setFetchedAt] = useState(0)
  const [loadErr, setLoadErr] = useState('')
  const [active, setActive] = useState<Section | null>(null)
  const [unread, setUnread] = useState(0)
  const [msgTarget, setMsgTarget] = useState<MessageTarget | null>(null)
  const [reportJob, setReportJob] = useState<number | null>(null)
  const [claimJob, setClaimJob] = useState<number | null>(null)
  const [loc, askLoc] = useLocationPermission()

  useEffect(() => {
    if (ready && !user) navigate({ to: '/login', search: { next: '/dashboard' } })
  }, [ready, user, navigate])

  const reload = async () => {
    try {
      const d = await api.get<Dash>('/rider/dashboard')
      setData(d)
      setFetchedAt(Date.now())
      setLoadErr('')
    } catch (e: any) {
      setLoadErr(e.message || 'Could not load the delivery dashboard')
    }
    api.get<{ unread: number }>('/rider/messages').then((m) => setUnread(m.unread)).catch(() => {})
  }
  useEffect(() => {
    if (!user?.is_rider) return
    reload()
    const t = window.setInterval(reload, POLL_MS)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.is_rider])

  if (!ready || !user) return <PageLoading />
  if (!user.is_rider) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-10 lg:px-6">
        <Notice tone="info" icon={<Truck size={16} />} title="This page is for delivery partners" action={<LinkButton to="/" size="sm">{user.application?.status === 'pending' ? 'View application' : 'Apply for delivery'}</LinkButton>}>
          Pick up parcels from the shelf in your ward and deliver them the same day — short routes, fixed rates, weekly payouts.
        </Notice>
      </div>
    )
  }
  if (loadErr && !data) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-10 lg:px-6">
        <Notice tone="warning" icon={<Truck size={16} />} title="Delivery dashboard unavailable" action={<Button size="sm" variant="outline" onClick={reload}>Retry</Button>}>{loadErr}</Notice>
      </div>
    )
  }
  if (!data) return <PageLoading />

  const { rider, stats, offered, completed } = data
  const activeJobs = data.active
  const pickups: Pickups = data.pickups ?? { offered: [], active: [], completed: [] }
  const onRoute = activeJobs.length + pickups.active.length
  // Opens on the job in hand when there is one, otherwise on the orders waiting for him.
  const section: Section = active ?? (onRoute ? 'route' : 'orders')
  const go = (s: Section) => { setActive(s); window.scrollTo({ top: 0 }) }
  const nav: NavItem[] = [
    { key: 'orders', label: 'Orders', icon: Inbox, badge: offered.length + pickups.offered.length },
    { key: 'route', label: 'On route', icon: Navigation, badge: onRoute },
    { key: 'messages', label: 'Messages', icon: MessageSquare, badge: unread },
    { key: 'wallet', label: 'Wallet', icon: Banknote },
    { key: 'area', label: 'Ward area', icon: MapIcon },
    { key: 'profile', label: 'Profile', icon: UserIcon },
    { key: 'report', label: 'Report', icon: ClipboardList },
    { key: 'insurance', label: 'Insurance', icon: ShieldCheck },
    { key: 'cancel', label: 'Cancel contract', icon: UserX },
  ]
  const setRider = (r: Rider) => setData((d) => (d ? { ...d, rider: r } : d))

  const toggleOnline = async () => {
    try {
      const r = await api.post<{ is_online: boolean }>('/rider/toggle-online')
      setData((d) => (d ? { ...d, rider: { ...d.rider, is_online: r.is_online } } : d))
      toast.success(r.is_online ? 'You are online — orders in your ward area will be offered to you' : 'You are offline — no new orders')
      reload()
    } catch (e: any) {
      toast.error(e.message)
    }
  }
  const messageJob = (id: number) => { setMsgTarget(`job:d${id}`); go('messages') }
  const reportOn = (id: number) => { setReportJob(id); go('report') }
  const claimOn = (id: number) => { setClaimJob(id); go('insurance') }

  const brand = (
    <div className="flex items-center gap-2.5">
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-full">{rider.avatar ? <img src={rider.avatar} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center rounded-full bg-primary-300 font-head text-sm font-bold text-white">{(rider.name || user.name).split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')}</span>}</span>
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-head text-[13px] font-bold text-ink">{rider.name || user.name}</span>
        <span className="truncate text-[10px] text-muted">{vehicleLabel(rider.vehicle_type)} · {rider.number_plate || 'no plate'} · {rider.rating ? rider.rating.toFixed(1) : '—'} ★</span>
        {rider.company_email && <span className="truncate text-[10px] font-semibold text-primary" title="Your UKO company email">{rider.company_email}</span>}
      </div>
    </div>
  )

  const areaSub = `${rider.wards.length ? rider.wards.join(', ') : 'No wards set'} · ${rider.start_time || '—'} – ${rider.end_time || '—'}`

  return (
    <DashboardShell brand={brand} nav={nav} active={section} onSelect={(k) => go(k as Section)} toggle={{ label: 'Online for orders', checked: rider.is_online, onChange: toggleOnline }}>
      <LocationBanner state={loc} onAllow={askLoc} />

      {section === 'orders' && (
        <>
          <DashHeader title="Orders" sub={`${rider.is_online ? 'Online' : 'Offline'} · ${areaSub}`}
                      actions={<Button variant="outline" size="sm" icon={<MapIcon size={14} />} onClick={() => go('area')}>Adjust ward area</Button>} />
          <StatsRow stats={stats} />
          {onRoute > 0 && (
            <Notice tone="info" icon={<Navigation size={16} />} title={`${onRoute} job${onRoute === 1 ? '' : 's'} on route`} action={<Button size="sm" onClick={() => go('route')}>Open on-route</Button>}>
              Codes, route map and live tracking are on the On-route tab.
            </Notice>
          )}
          <OrdersTabs offered={offered} completed={completed} pickupsDone={pickups.completed} rider={rider} currentJob={stats.current_job} fetchedAt={fetchedAt} loc={loc} askLoc={askLoc}
                      onAccepted={async () => { await reload(); go('route') }} onDone={reload} goOnline={toggleOnline} />
          <PickupOffersPanel offered={pickups.offered} rider={rider} currentJob={stats.current_job} onAccepted={async () => { await reload(); go('route') }} />
        </>
      )}

      {section === 'route' && (
        <>
          <DashHeader title="On route" sub={`${onRoute} active job${onRoute === 1 ? '' : 's'} · collect with your shelf code, drop with the buyer's code · your location is shared while on route`} />
          {onRoute === 0 ? (
            <EmptyState icon={<Navigation size={26} />} title="Nothing on route" sub="Accepted orders and shelf pick-ups appear here with the codes, the route map and live tracking." action={<Button size="sm" variant="outline" onClick={() => go('orders')}>See orders</Button>} />
          ) : (
            <>
              {activeJobs.map((d) => <ActiveJobPanel key={d.id} job={d} onDone={reload} onMessage={() => messageJob(d.id)} onReport={() => reportOn(d.id)} onClaim={() => claimOn(d.id)} />)}
              {pickups.active.map((j) => <PickupJobPanel key={`pu-${j.id}`} job={j} onDone={reload} />)}
            </>
          )}
        </>
      )}

      {section === 'messages' && (
        <>
          <DashHeader title="Messages" sub="Per delivery: message its buyer, its sellers, its shelves — or everyone on it at once" />
          <MessagesPanel initial={msgTarget} onUnread={setUnread} />
        </>
      )}

      {section === 'wallet' && (
        <>
          <DashHeader title="Wallet" sub="Delivery fees land here the moment the buyer's code confirms the hand-over · withdraw to M-PESA (10% withdrawal fee)" />
          <EarningsStats stats={stats} completed={completed} pickups={pickups.completed} />
          <WalletPanel
            role="rider"
            methods={['mpesa']}
            intro={
              <Notice tone="info" icon={<Banknote size={16} />} title="Rider wallet · M-PESA">
                Withdraw any amount from {ksh(100)} to your M-PESA number. A 10% UKO fee is deducted from each withdrawal — the breakdown is shown before you confirm. UKO also keeps {stats.commission_pct ?? 10}% of every trip fee, so your wallet gets the other {100 - (stats.commission_pct ?? 10)}%. Each delivery fee is credited when the buyer's 4-digit rider code, a signature or a door photo confirms the drop. If UKO has linked your profile to a UKO shop account, you can also spend this wallet on UKO services in the shop — a boost, a messaging package or AI prompts — with no fee at all: pick “Delivery wallet” when you pay there.
              </Notice>
            }
          />
        </>
      )}

      {section === 'area' && (
        <>
          <DashHeader title="Ward area" sub="Orders are only offered from shelves in, or going to, these wards — and only inside your working hours" />
          <AreaPanel rider={rider} onSaved={(r) => { setRider(r); reload() }} />
        </>
      )}

      {section === 'profile' && (
        <>
          <DashHeader title="Profile" sub="How buyers, shelves and the delivery team reach you" />
          <div className="grid gap-4 xl:grid-cols-[520px_1fr]">
            <ProfilePanel rider={rider} onSaved={setRider} />
            <Panel title="Vehicle">
              <div className="flex flex-col gap-2 text-[13px] text-ink-2">
                <span><strong className="text-ink">{vehicleLabel(rider.vehicle_type)}</strong> · {rider.number_plate || 'no plate on file'}</span>
                <span>Rating {rider.rating ? rider.rating.toFixed(1) : '—'} ★ · {rider.drops} drops</span>
                <span className="text-[11px] text-muted">To change your vehicle or plate, call the delivery team on 0700 000 111.</span>
              </div>
            </Panel>
          </div>
        </>
      )}

      {section === 'report' && (
        <>
          <DashHeader title="Report" sub="Your deliveries and earnings, and problems sent to the UKO delivery team" />
          <ReportPanel jobs={[...activeJobs, ...completed]} initialJob={reportJob} />
        </>
      )}

      {section === 'insurance' && (
        <>
          <DashHeader title="Insurance" sub="UKO goods cover — parcels lost, damaged or stolen while in your custody" />
          <InsurancePanel jobs={[...activeJobs, ...completed]} pickups={[...pickups.active, ...pickups.completed]} initialJob={claimJob} />
        </>
      )}

      {section === 'cancel' && (
        <>
          <DashHeader title="Cancel contract" sub="Stop delivering for UKO" />
          <CancelContractPanel activeJobs={onRoute} wallet={stats.wallet} onRoute={() => go('route')} />
        </>
      )}
    </DashboardShell>
  )
}

// ---------------------------------------------------------------- Location (accepted at sign-in)
function LocationBanner({ state, onAllow }: { state: LocationState; onAllow: () => Promise<LocationState> }) {
  if (state === 'granted') return null
  if (state === 'unsupported') {
    return <Notice tone="warning" icon={<MapPin size={16} />} title="This browser cannot share its location">Use a phone browser with location (Chrome or Safari) to take orders — buyers follow you on the map while you are on route.</Notice>
  }
  return (
    <Notice tone={state === 'denied' ? 'danger' : 'warning'} icon={<MapPin size={16} />}
            title={state === 'denied' ? 'Location tracking is blocked' : 'Turn on location tracking'}
            action={state === 'prompt' ? <Button size="sm" onClick={onAllow}>Allow location</Button> : undefined}>
      {state === 'denied'
        ? 'You accepted tracking when you signed in, but this browser is blocking location for UKO delivery. Allow it in the site settings (the icon next to the address bar) — you cannot accept orders until it is on.'
        : 'You accepted location tracking when you signed in. Allow it in the browser so you can accept orders and the buyer can watch you arrive.'}
    </Notice>
  )
}

function vehicleLabel(v: string) {

  return ({ motorbike: 'Motorbike', bicycle: 'Bicycle', car: 'Car', van: 'Van / pickup', foot: 'On foot' } as Record<string, string>)[v] || (v ? v.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'Rider')
}

// ---------------------------------------------------------------- Stats
function StatsRow({ stats }: { stats: Stats }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 md:gap-4">
        <StatCard label="Deliveries today" value={stats.deliveries_today} />
        <StatCard label="Earnings this week" value={ksh(stats.earnings_week)} />
        <StatCard label="Wallet" value={ksh(stats.wallet)} />
        <StatCard label="On-time rate" value={`${stats.on_time_rate}%`} />
        <StatCard label="Rating" value={`${stats.rating ? stats.rating.toFixed(1) : '—'} ★`} />
        <StatCard label={stats.active_jobs === 1 ? 'Active job' : 'Active jobs'} value={stats.active_jobs} />
      </div>
      <span className="text-[11px] text-muted">Earnings are what reaches your wallet: {100 - (stats.commission_pct ?? 10)}% of each trip fee · UKO keeps {stats.commission_pct ?? 10}%</span>
    </div>
  )
}

/** "You earn KSh X · UKO keeps 10 %" — the rider's share of a trip fee, shown wherever a fee is. */
function EarnLine({ earns, fee, pct = 10, className }: { earns: number; fee: number; pct?: number; className?: string }) {
  return <span className={cx('text-[10px] text-muted', className)}>You earn {ksh(earns)} · UKO keeps {pct}% of the {ksh(fee)} fee</span>
}

// ---------------------------------------------------------------- On route
const STEPS = [
  { key: 'accepted', label: 'Accepted' },
  { key: 'collected', label: 'Collected' },
  { key: 'on_the_way', label: 'On the way' },
  { key: 'delivered', label: 'Delivered' },
]

function stepOf(status: string): number {
  return ({ accepted: 0, picked_up: 1, on_the_way: 2, delivered: 3 } as Record<string, number>)[status] ?? 0
}

function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371.0088
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Turn-by-turn in Google Maps: from here, through the shelves still to collect from, to the drop. */
function directionsUrl(from: { lat: number; lng: number } | null, stops: { lat: number; lng: number }[], to: { lat: number; lng: number } | null): string | null {
  const pts = [...stops, ...(to ? [to] : [])]
  if (!pts.length) return null
  const fmt = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`
  const dest = pts[pts.length - 1]
  const via = pts.slice(0, -1)
  const q = new URLSearchParams({ api: '1', destination: fmt(dest), travelmode: 'driving' })
  if (from) q.set('origin', fmt(from))
  if (via.length) q.set('waypoints', via.map(fmt).join('|'))
  return `https://www.google.com/maps/dir/?${q.toString()}`
}

function ActiveJobPanel({ job, onDone, onMessage, onReport, onClaim }: { job: Delivery; onDone: () => Promise<void>; onMessage: () => void; onReport: () => void; onClaim: () => void }) {
  const toast = useToast()
  const [releasing, setReleasing] = useState(false)
  const origin = job.origin
  const buyer = job.buyer
  // Watching this device is what puts the rider on the buyer's tracking map, so it runs for as long as
  // the job does. `fix` is the browser's own reading — it moves the dot here even if the write failed.
  const { fix, error: gpsErr, lastSent } = useRiderLocation(job.id)
  // A locked screen stops this page on many phones, and with it the location reports.
  const awake = useWakeLock(true)
  const collecting = job.status === 'accepted'
  const shelves = job.stop_shelves?.length ? job.stop_shelves : origin ? [{ ...origin, handed_over: !collecting }] : []
  const toCollect = shelves.filter((s) => !s.handed_over && s.lat != null && s.lng != null) as { lat: number; lng: number }[]
  const me = fix ?? (job.rider_lat != null && job.rider_lng != null ? { lat: job.rider_lat, lng: job.rider_lng } : null)
  const dropShelf = job.destination_shelve
  const dest = dropShelf?.lat != null && dropShelf?.lng != null ? { lat: dropShelf.lat, lng: dropShelf.lng }
    : job.dest_lat != null && job.dest_lng != null ? { lat: job.dest_lat, lng: job.dest_lng } : null

  const points: MapPoint[] = []
  shelves.forEach((s, i) => points.push({ id: `shelf-${s.id}`, lat: s.lat, lng: s.lng, label: `${shelves.length > 1 ? `${i + 1}. ` : ''}${s.name}${s.handed_over ? ' ✓' : ''}`, tone: 'success' }))
  if (me) points.push({ id: 'me', lat: me.lat, lng: me.lng, label: 'Me', tone: 'primary' })
  if (dest) points.push({ id: 'dest', lat: dest.lat, lng: dest.lng, label: dropShelf?.name || buyer?.name || 'Buyer', tone: 'secondary' })

  const next = collecting ? toCollect[0] ?? null : dest
  const left = me && next ? kmBetween(me, next) : null
  const nav = directionsUrl(me, collecting ? toCollect : [], dest)
  const step = stepOf(job.status)

  const release = async () => {
    if (!window.confirm(`Hand ${job.tracking_no} back? It goes to another rider and you will not be offered it again.`)) return
    setReleasing(true)
    try {
      await api.post(`/rider/jobs/${job.id}/decline`)
      toast.success(`${job.tracking_no} handed back`)
      await onDone()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setReleasing(false)
    }
  }

  return (
    <Panel
      title={`On route · ${job.tracking_no}`}
      sub={`Order ${job.order_no} · window ${job.window_start} – ${job.window_end}${job.eta ? ` · ETA ${job.eta}` : ''}`}
      action={<div className="flex items-center gap-2"><StatusPill status={job.status} /><Chip tone="primary">You earn {ksh(job.rider_earns)}</Chip></div>}
      className="border-primary"
    >
      <div className="flex flex-col gap-5">
        <TrackSteps step={step} />
        <KeepPhoneOn awake={awake} lastSent={lastSent} warnMinutes={job.tracking?.warn_minutes} missingMinutes={job.tracking?.missing_minutes} />
        <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
          <div className="flex flex-col gap-2">
            <MapView points={points} line follow="me" height={320} className="lg:h-full lg:min-h-[320px]"
                     hint={!dest ? 'No drop point pinned — use the address and phone' : undefined} />
            <div className="flex flex-wrap items-center gap-2">
              {gpsErr
                ? <Notice tone="warning" icon={<TriangleAlert size={14} />} className="flex-1">{gpsErr}</Notice>
                : <span className="flex flex-1 items-center gap-1.5 text-[11px] text-muted">
                    <span className={cx('h-2 w-2 rounded-full', fix ? 'animate-pulse bg-success' : 'bg-border-strong')} />
                    {fix ? `Tracking on · shared with the buyer${left != null ? ` · ${left < 1 ? `${Math.round(left * 1000)} m` : `${left.toFixed(1)} km`} to ${collecting ? 'the next shelf' : 'the drop'}` : ''} · ±${fix.accuracy} m`
                         : 'Waiting for your location…'}
                  </span>}
              {nav && <a href={nav} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600"><Navigation size={12} /> Navigate in Google Maps <ExternalLink size={11} /></a>}
            </div>
            <TrackingLinkCard url={job.tracking?.url} me={me} trackingNo={job.tracking_no} />
          </div>
          <div className="flex flex-col gap-3">
            <ShelfCodes job={job} shelves={shelves} />
            {dropShelf ? (
              <ContactCard icon={<Store size={15} className="text-secondary" />} label="Drop · receiving shelf" name={dropShelf.name}
                           address={`${dropShelf.address || dropShelf.ward}${dropShelf.opening_time ? ` · open ${dropShelf.opening_time} – ${dropShelf.closing_time}` : ''}`}
                           contact={`${dropShelf.owner_name || 'Shelf owner'} · ${dropShelf.contact_phone || '—'}`} phone={dropShelf.contact_phone} />
            ) : (
              <ContactCard icon={<House size={15} className="text-secondary" />} label="Drop · buyer" name={buyer?.name || 'Buyer'}
                           address={`${job.destination}${buyer?.notes ? ` · ${buyer.notes}` : ''}`} contact={`Buyer · ${buyer?.phone || '—'}`} phone={buyer?.phone} />
            )}
            <div className="flex flex-col gap-2.5 rounded-md border border-border bg-bg p-3.5">
              <span className="text-xs font-bold text-ink">Item(s) in this delivery</span>
              {job.items.length === 0 ? (
                <span className="text-[11px] text-muted">{job.weight_kg} kg parcel</span>
              ) : (
                job.items.map((it) => (
                  <div key={it.id} className="flex items-center gap-2.5">
                    <Thumb src={it.image} size={34}>{!it.image && <Package size={13} className="text-border-strong" />}</Thumb>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[11px] font-semibold text-ink">{it.title}{it.variant_label ? `, ${it.variant_label}` : ''}</span>
                      <span className="truncate text-[10px] text-muted">{it.code}</span>
                    </div>
                    <span className="text-[11px] text-muted">×{it.quantity}</span>
                  </div>
                ))
              )}
            </div>
            <ConfirmCard job={job} onDone={onDone} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button size="sm" variant="outline" icon={<Users size={13} />} onClick={onMessage}>Message</Button>
              <Button size="sm" variant="outline" icon={<Flag size={13} />} onClick={onReport}>Report</Button>
              <Button size="sm" variant="outline" icon={<ShieldCheck size={13} />} onClick={onClaim}>Claim</Button>
              <Button size="sm" variant="outline" icon={<Undo2 size={13} />} loading={releasing} disabled={!collecting || !!job.handovers?.length} onClick={release}>Hand back</Button>
            </div>
          </div>
        </div>
        {job.events?.length > 0 && (
          <ol className="m-0 flex list-none flex-col gap-2 border-t border-border p-0 pt-4">
            {[...job.events].reverse().map((e, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={cx('mt-1 h-2 w-2 shrink-0 rounded-full', i === 0 ? 'bg-primary' : 'bg-border-strong')} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-xs font-semibold text-ink">{e.title}</span>
                  <span className="text-[11px] text-muted">{e.sub}</span>
                </div>
                <span className="shrink-0 text-[10px] text-muted">{fmtDate(e.time)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Panel>
  )
}

function TrackSteps({ step }: { step: number }) {
  return (
    <ol className="m-0 grid list-none grid-cols-4 gap-1 p-0" aria-label="Delivery progress">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex flex-col gap-1.5">
          <span className={cx('h-1.5 rounded-full', i <= step ? 'bg-primary' : 'bg-surface-2')} />
          <span className={cx('text-[10px] font-semibold sm:text-[11px]', i === step ? 'text-primary' : i < step ? 'text-ink-2' : 'text-muted')}>{s.label}</span>
        </li>
      ))}
    </ol>
  )
}

/** The shelf side of the job: his collection code and every shelf he collects from, ticked off as each hands over. */
function ShelfCodes({ job, shelves }: { job: Delivery; shelves: { id: number; name: string; ward: string; contact_phone: string; handed_over: boolean }[] }) {
  if (!shelves.length) return null
  const collecting = job.status === 'accepted'
  return (
    <div className="flex flex-col gap-2.5 rounded-md bg-surface p-3.5">
      <div className="flex items-center gap-2">
        <Store size={15} className="text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Pickup · shelf code{shelves.length > 1 ? `s · ${shelves.length} shelves` : ''}</span>
      </div>
      {collecting && job.collect_code && (
        <div className="flex items-center gap-3">
          <KeyRound size={15} className="text-primary" />
          <CodeDigits value={job.collect_code} length={4} size="sm" />
          <span className="text-[10px] leading-snug text-muted">Give this code and show your national ID at {shelves.length > 1 ? 'each shelf' : 'the shelf'}</span>
        </div>
      )}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {shelves.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2.5 text-[11px]">
            <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold', s.handed_over ? 'bg-success text-white' : 'bg-bg text-ink-2')}>{s.handed_over ? '✓' : i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-ink">{s.name} <span className="font-normal text-muted">· {s.ward}</span></span>
            {s.contact_phone && <a href={`tel:${s.contact_phone.replace(/\s+/g, '')}`} className="text-primary-600 hover:underline"><Phone size={12} /></a>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ContactCard({ icon, label, name, address, contact, phone }: { icon: ReactNode; label: string; name: string; address: string; contact: string; phone?: string }) {
  const btn = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold text-ink hover:bg-bg'
  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-bg">{icon}</span>
        <div className="flex min-w-0 flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</span>
          <span className="truncate font-head text-sm font-bold text-ink">{name}</span>
        </div>
      </div>
      <span className="text-[11px] leading-relaxed text-ink-2">{address}</span>
      {contact && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1 text-[11px] font-semibold text-ink">{contact}</span>
          <a href={phone ? `tel:${phone.replace(/\s+/g, '')}` : '#'} className={btn}><Phone size={12} /> Call</a>
          <a href={phone ? `sms:${phone.replace(/\s+/g, '')}` : '#'} className={btn}><MessageSquare size={12} /> Message</a>
        </div>
      )}
    </div>
  )
}

function ConfirmCard({ job, onDone }: { job: Delivery; onDone: () => Promise<void> }) {
  const toast = useToast()
  const photo = useRef<HTMLInputElement>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const pickupStage = job.status === 'accepted'
  // Leaving a shelf, the shelf releases the parcel: the rider only shows his code and his national ID.
  const shelfPickup = pickupStage && !!job.origin
  // shelves he collects from: the route's stops bar the one the run ends at
  const pickupCount = Math.max(1, (job.stops || []).filter((id) => id !== job.destination_shelve?.id).length)
  const handed = job.handovers || []
  // A run that ends at a shelf is signed for by that shelf, not by the buyer — different code, different
  // wording, and no signature or photo fallback.
  const toShelf = job.drops_at_shelve
  const stopCount = job.stops?.length ?? 0

  const run = async (kind: string, fn: () => Promise<unknown>, ok: string) => {
    setErr('')
    setBusy(kind)
    try {
      await fn()
      toast.success(ok)
      setCode('')
      await onDone()
    } catch (e: any) {
      setErr(e.message || 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }
  const pickup = () => {
    if (code.length < 4) return setErr("Ask the seller for their 4-digit code and enter it")
    run('pickup', () => api.post(`/rider/jobs/${job.id}/picked-up`, { handoff_code: code }), `Picked up · ${job.tracking_no} is on the way`)
  }
  const deliver = (body: { confirm_code?: string; signature?: string; photo?: string }, kind: string) =>
    run(kind, () => api.post(`/rider/jobs/${job.id}/deliver`, body), `Delivered · ${ksh(job.rider_earns)} added to your rider wallet (UKO keeps 10%)`)
  const onPhoto = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    setBusy('photo')
    try {
      const r = await api.upload(f)
      await deliver({ photo: r.url }, 'photo')
    } catch (e: any) {
      setErr(e.message)
      setBusy(null)
    } finally {
      if (photo.current) photo.current.value = ''
    }
  }

  if (shelfPickup) {
    return (
      <div className="flex flex-col gap-2.5 rounded-md bg-primary-050 p-3.5">
        <span className="text-xs font-bold text-ink">{pickupCount > 1 ? `Collect at ${pickupCount} shelves` : `Collect at ${job.origin?.name || 'the shelf'}`}</span>
        <span className="text-[10px] leading-relaxed text-ink-2">
          Give {pickupCount > 1 ? 'each shelf' : 'the shelf'} this collection code and show your national ID. The shelf enters both and hands you its items; this job moves on by itself once {pickupCount > 1 ? 'the last shelf has' : 'it has'}.
        </span>
        {pickupCount > 1 && (
          <span className="text-[10px] font-semibold text-ink">
            {handed.length} of {pickupCount} shelves handed over{handed.length ? ` · ${handed.map((h) => h.shelve).join(', ')}` : ''}
          </span>
        )}
        <div className="flex items-center gap-3">
          <span className="flex-1 text-[10px] text-muted">Your shelf code is above. It is yours for this job only — never share it with anyone but the shelf.</span>
          <Button size="sm" variant="outline" loading={busy === 'refresh'} onClick={() => run('refresh', async () => {}, 'Job refreshed')}>Refresh</Button>
        </div>
        {err && <Notice tone="danger">{err}</Notice>}
      </div>
    )
  }

  return (
    <div className={cx('flex flex-col gap-2.5 rounded-md p-3.5', pickupStage ? 'bg-primary-050' : 'bg-success-050')}>
      <span className="text-xs font-bold text-ink">{pickupStage ? 'Confirm pickup' : toShelf ? 'Confirm shelf transfer' : 'Confirm hand-over'}</span>
      <span className="text-[10px] leading-relaxed text-ink-2">
        {pickupStage
          ? stopCount > 1
            ? `Collect from all ${stopCount} shelves on this run, each shelf confirms its hand-over with your collection code.`
            : "Ask the seller for their 4-digit code when they hand you the parcel, and enter it here. The app never shows it to you."
          : toShelf
            ? `Hand the cart to ${job.destination_shelve?.name || 'the receiving shelf'} and ask them for their 4-digit transfer code. The buyer collects it there himself.`
            : "Ask the buyer for their 4-digit rider code when you hand the parcel over, or capture a signature or door photo."}
      </span>
      <div className="flex flex-wrap items-center gap-2.5">
        <CodeDigits value={code} length={4} onChange={setCode} size="sm" />
        {pickupStage ? (
          <Button size="sm" className="flex-1" loading={busy === 'pickup'} disabled={!!busy && busy !== 'pickup'} onClick={pickup}>Confirm pickup</Button>
        ) : (
          <Button size="sm" className="flex-1" loading={busy === 'code'} disabled={!!busy && busy !== 'code'} onClick={() => (code.length < 4 ? setErr(toShelf ? "Ask the receiving shelf for its 4-digit transfer code and enter it" : "Ask the buyer for their 4-digit rider code and enter it") : deliver({ confirm_code: code }, 'code'))}>{toShelf ? 'Mark transferred' : 'Mark delivered'}</Button>
        )}
      </div>
      <ul className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0 text-[10px] text-muted">
        <li className="flex items-center gap-1"><KeyRound size={10} /> Shelf code</li>
        <li>·</li>
        <li>Seller code</li>
        <li>·</li>
        <li>{toShelf ? 'Transfer code' : 'Buyer code'}</li>
        <li>— each is unique and different</li>
      </ul>
      {/* A shelf-to-shelf drop is proved by the receiving shelf's code and nothing else: a signature or a
          door photo says a parcel was handed over, not which shelf now holds it. */}
      {!pickupStage && !toShelf && (
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" icon={<PenLine size={13} />} loading={busy === 'signature'} disabled={!!busy && busy !== 'signature'} onClick={() => deliver({ signature: 'signed-on-device' }, 'signature')}>Signature</Button>
          <Button size="sm" variant="outline" icon={<Camera size={13} />} loading={busy === 'photo'} disabled={!!busy && busy !== 'photo'} onClick={() => photo.current?.click()}>Photo</Button>
          <input ref={photo} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files)} />
        </div>
      )}
      {err && <Notice tone="danger">{err}</Notice>}
    </div>
  )
}

// ---------------------------------------------------------------- Orders: accept / reject, and the ones already done
function OrdersTabs({ offered, completed, pickupsDone, rider, currentJob, fetchedAt, loc, askLoc, onAccepted, onDone, goOnline }: {
  offered: Offered[]; completed: Delivery[]; pickupsDone: PickupJob[]; rider: Rider; currentJob?: string | null; fetchedAt: number; loc: LocationState; askLoc: () => Promise<LocationState>
  onAccepted: () => Promise<void>; onDone: () => Promise<void>; goOnline: () => void
}) {
  const [tab, setTab] = useState<'offered' | 'completed'>('offered')
  return (
    <>
      <Tabs tabs={[{ key: 'offered', label: 'New orders', count: offered.length }, { key: 'completed', label: 'Completed', count: completed.length + pickupsDone.length }]} value={tab} onChange={setTab} />
      {tab === 'offered'
        ? <OfferedPanel offered={offered} rider={rider} currentJob={currentJob} fetchedAt={fetchedAt} loc={loc} askLoc={askLoc} onAccepted={onAccepted} onDone={onDone} goOnline={goOnline} />
        : <><CompletedPanel completed={completed} />{pickupsDone.length > 0 && <CompletedPickupsPanel jobs={pickupsDone} />}</>}
    </>
  )
}

// ---------------------------------------------------------------- Item trips between a seller and a shelf
// The same job runs both ways. `to_shelf` is the hand-off out — collect at the seller, drop at the shelf, which
// checks the item in and pays you. `to_seller` is the item going home (shop PRD 14): collect at the shelf
// against the host's release code, and hand it to the seller at his own door against his, which is where you
// are paid. The API spells both stops out on every job (`collect` / `drop`), so nothing here guesses.
const isHome = (j: PickupJob) => j.kind === 'to_seller'

function pickupRoute(j: PickupJob): string {
  const a = j.collect?.name || (isHome(j) ? j.shelf?.name : j.pickup_address) || 'Pick-up'
  const b = j.drop?.name || (isHome(j) ? 'Seller' : j.shelf?.name) || 'Drop'
  const where = isHome(j) ? (j.dest_address || j.item?.ward || '') : (j.shelf?.ward || '')
  return `${a}  →  ${b}${where ? ` (${where})` : ''}`
}

function PickupOffersPanel({ offered, rider, currentJob, onAccepted }: { offered: PickupJob[]; rider: Rider; currentJob?: string | null; onAccepted: () => Promise<void> }) {
  const toast = useToast()
  const [busy, setBusy] = useState<number | null>(null)
  // "Not now" only hides it on this device — the trip stays open for every rider, him included after a reload.
  const [hidden, setHidden] = useState<number[]>([])
  const shown = offered.filter((j) => !hidden.includes(j.id))

  const accept = async (j: PickupJob) => {
    setBusy(j.id)
    try {
      await api.post(`/rider/pickups/${j.id}/accept`)
      toast.success(`Accepted ${j.job_no} · collect from ${isHome(j) ? 'the shelf with their release code' : 'the seller with their 4-digit code'}`)
      await onAccepted()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel title="Item trips" sub="A seller's item to its shelf, or an item off a shelf and home to its seller — whoever hands it over reads you a 4-digit code" action={<Chip size="sm" tone="warning">{shown.length}</Chip>} padded={false}>
      {!rider.is_online ? (
        <div className="p-5"><EmptyState icon={<Store size={26} />} title="You are offline" sub="Go online to be offered item trips in your ward area." /></div>
      ) : currentJob ? (
        <div className="p-5"><EmptyState icon={<Navigation size={26} />} title={`You have ${currentJob} in hand`} sub="One job at a time — finish it or hand it back and item trips show up here again." /></div>
      ) : shown.length === 0 ? (
        <div className="p-5"><EmptyState icon={<Store size={26} />} title="No item trips right now" sub={`Paid trips in ${rider.wards.length ? rider.wards.join(', ') : 'your wards'} show up here.`} /></div>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
          {shown.map((j) => (
            <li key={j.id} className="flex flex-col gap-3 px-5 py-3.5 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Thumb src={j.item?.image} size={36}>{!j.item?.image && <Package size={15} className="text-border-strong" />}</Thumb>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Chip size="sm" tone={isHome(j) ? 'secondary' : 'neutral'}>{isHome(j) ? 'Home to seller' : 'To a shelf'}</Chip>
                    <span className="truncate text-xs font-bold text-ink">{pickupRoute(j)} · {j.distance_km} km</span>
                  </span>
                  <span className="truncate text-[10px] text-ink-2">{j.job_no} · {j.item?.title || 'Item'}{j.item?.weight_kg ? ` · ${j.item.weight_kg} kg` : ''} · {vehicleLabel(j.vehicle)}</span>
                  <EarnLine earns={j.rider_earns} fee={j.fee} pct={j.commission_pct} />
                </div>
              </div>
              <div className="flex items-center gap-3 md:shrink-0">
                <span className="w-[70px] font-head text-sm font-extrabold text-ink">{ksh(j.rider_earns)}</span>
                <Button size="sm" loading={busy === j.id} disabled={busy !== null && busy !== j.id} onClick={() => accept(j)}>Accept</Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setHidden([...hidden, j.id])}>Not now</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function PickupJobPanel({ job, onDone }: { job: PickupJob; onDone: () => Promise<void> }) {
  const toast = useToast()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const collecting = job.status === 'accepted'
  const shelf = job.shelf
  const home = isHome(job)
  // Tracked from accept until it is handed over, exactly like a delivery.
  const { fix, error: gpsErr, lastSent } = useRiderLocation(job.id, 'pickups')
  const awake = useWakeLock(true)
  const me = fix ? { lat: fix.lat, lng: fix.lng } : null
  // Both ends come off the job, so the map does not care which way this trip runs.
  const from = job.collect?.lat != null && job.collect?.lng != null ? { lat: job.collect.lat, lng: job.collect.lng } : null
  const to = job.drop?.lat != null && job.drop?.lng != null ? { lat: job.drop.lat, lng: job.drop.lng } : null
  const nav = directionsUrl(me, collecting && from ? [from] : [], to)
  const points: MapPoint[] = []
  if (from && collecting) points.push({ id: 'from', lat: from.lat, lng: from.lng, label: job.collect?.name || 'Pick-up', tone: 'secondary' })
  if (me) points.push({ id: 'me', lat: me.lat, lng: me.lng, label: 'Me', tone: 'primary' })
  if (to) points.push({ id: 'to', lat: to.lat, lng: to.lng, label: job.drop?.name || 'Drop', tone: 'success' })

  const run = async (kind: string, fn: () => Promise<unknown>, ok: string) => {
    setErr('')
    setBusy(kind)
    try {
      await fn()
      toast.success(ok)
      setCode('')
      await onDone()
    } catch (e: any) {
      setErr(e.message || 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }
  const collect = () => {
    if (code.length < 4) return setErr(home ? "Enter the shelf owner's 4-digit release code" : "Enter the seller's 4-digit hand-off code")
    run('collect', () => api.post(`/rider/pickups/${job.id}/collected`, { code }),
        `Collected · take ${job.job_no} to ${job.drop?.name || (home ? 'the seller' : 'the shelf')}`)
  }
  /** Only a trip home ends with the rider: nobody at a doorstep can check an item in, so he closes it himself. */
  const handOver = () => {
    if (code.length < 4) return setErr("Enter the seller's 4-digit code — he reads it off his ads page")
    run('deliver', () => api.post(`/rider/pickups/${job.id}/delivered`, { seller_code: code }),
        `${job.job_no} is with its seller · ${ksh(job.rider_earns)} added to your wallet`)
  }
  const release = () => {
    if (!window.confirm(`Hand ${job.job_no} back? It goes back on offer to other riders.`)) return
    run('release', () => api.post(`/rider/pickups/${job.id}/release`), `${job.job_no} handed back`)
  }

  return (
    <Panel
      title={`${home ? 'Item home to its seller' : 'Shelf pick-up'} · ${job.job_no}`}
      sub={`${job.item?.title || 'Item'}${job.item?.weight_kg ? ` · ${job.item.weight_kg} kg` : ''} · ${vehicleLabel(job.vehicle)} · ${job.distance_km} km`}
      action={<div className="flex items-center gap-2"><StatusPill status={job.status} /><Chip tone="primary">You earn {ksh(job.rider_earns)}</Chip></div>}
      className="border-primary"
    >
      <KeepPhoneOn awake={awake} lastSent={lastSent} warnMinutes={job.tracking?.warn_minutes} missingMinutes={job.tracking?.missing_minutes} />
      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_420px]">
        <div className="flex flex-col gap-2">
          <MapView points={points} line follow="me" height={280} hint={!points.length ? 'No pins for this pick-up — use the address and phone' : undefined} />
          {gpsErr && <Notice tone="warning" icon={<TriangleAlert size={14} />}>{gpsErr}</Notice>}
          <div className="flex flex-wrap items-center gap-2">
            <EarnLine earns={job.rider_earns} fee={job.fee} pct={job.commission_pct} className="flex-1" />
            {nav && <a href={nav} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600"><Navigation size={12} /> Navigate in Google Maps <ExternalLink size={11} /></a>}
          </div>
          <TrackingLinkCard url={job.tracking?.url} me={me} trackingNo={job.job_no} />
        </div>
        <div className="flex flex-col gap-3">
          {/* Where he is going now, and where after. On a trip home these are the shelf and then the seller;
              on a trip out, the seller and then the shelf. The job says which, so this does not have to. */}
          {collecting && (
            <ContactCard icon={home ? <Store size={15} className="text-secondary" /> : <House size={15} className="text-secondary" />}
                         label={`Collect from · ${job.collect?.what === 'shelf' ? 'shelf' : 'seller'}`}
                         name={job.collect?.name || 'Pick-up'} address={job.collect?.address || '—'}
                         contact={home ? (shelf?.contact_phone ? `Shelf · ${shelf.contact_phone}` : '') : `Seller · ${job.seller?.phone || '—'}`}
                         phone={home ? shelf?.contact_phone : job.seller?.phone} />
          )}
          <ContactCard icon={home ? <House size={15} className="text-secondary" /> : <Store size={15} className="text-secondary" />}
                       label={`Take it to · ${job.drop?.what === 'shelf' ? 'shelf' : 'seller'}`}
                       name={job.drop?.name || (home ? 'Seller' : shelf?.name || 'Shelf')}
                       address={job.drop?.address || (shelf ? `${shelf.address || shelf.ward}${shelf.ward ? ` · ${shelf.ward}` : ''}${shelf.county ? `, ${shelf.county}` : ''}` : '—')}
                       contact={home ? `Seller · ${job.seller?.phone || '—'}` : (shelf?.contact_phone ? `Shelf · ${shelf.contact_phone}` : '')}
                       phone={home ? job.seller?.phone : shelf?.contact_phone} />
          {collecting ? (
            <div className="flex flex-col gap-2.5 rounded-md bg-primary-050 p-3.5">
              <span className="text-xs font-bold text-ink">Confirm collection</span>
              <span className="text-[10px] leading-relaxed text-ink-2">{job.collect?.note || 'Whoever hands you the item reads you a 4-digit code.'} Enter it here — it proves you have the item.</span>
              <div className="flex flex-wrap items-center gap-2.5">
                <CodeDigits value={code} length={4} onChange={setCode} size="sm" />
                <Button size="sm" className="flex-1" loading={busy === 'collect'} disabled={!!busy && busy !== 'collect'} onClick={collect}>Confirm collection</Button>
              </div>
              <Button size="sm" variant="outline" icon={<Undo2 size={13} />} loading={busy === 'release'} disabled={!!busy && busy !== 'release'} onClick={release}>Hand back</Button>
              {err && <Notice tone="danger">{err}</Notice>}
            </div>
          ) : home ? (
            /* A doorstep has nobody to check an item in, so this is where the job ends and the rider is paid. */
            <div className="flex flex-col gap-2.5 rounded-md bg-success-050 p-3.5">
              <span className="text-xs font-bold text-ink">Hand it to {job.seller?.name || 'the seller'}</span>
              <span className="text-[10px] leading-relaxed text-ink-2">
                {job.drop?.note || 'The seller reads you his code when you hand the item over.'} Enter it only when the item is
                actually in his hands — that closes the job and pays you {ksh(job.rider_earns)}.
              </span>
              <div className="flex flex-wrap items-center gap-2.5">
                <CodeDigits value={code} length={4} onChange={setCode} size="sm" />
                <Button size="sm" className="flex-1" loading={busy === 'deliver'} disabled={!!busy && busy !== 'deliver'} onClick={handOver}>Confirm hand-over</Button>
              </div>
              {err && <Notice tone="danger">{err}</Notice>}
            </div>
          ) : (
            <Notice tone="info" icon={<Store size={16} />} title={`Waiting for ${shelf?.name || 'the shelf'} to check it in`}>
              Hand the item to the shelf host. You are paid {ksh(job.rider_earns)} the moment they check it in{job.collected_at ? ` · collected ${fmtDate(job.collected_at)}` : ''}.
            </Notice>
          )}
        </div>
      </div>
    </Panel>
  )
}

function CompletedPickupsPanel({ jobs }: { jobs: PickupJob[] }) {
  return (
    <Panel title="Completed shelf pick-ups" sub="Items you took from a seller to a shelf" padded={false}>
      <Table head={['Job', 'Item', 'Route', 'You earned', 'Date', 'Status']}>
        {jobs.map((j) => (
          <tr key={j.id}>
            <Td className="font-semibold text-ink">{j.job_no}</Td>
            <Td className="text-ink-2">{j.item?.title || '—'}</Td>
            <Td className="text-ink-2">{j.shelf?.name || '—'}{j.distance_km ? ` · ${j.distance_km} km` : ''}</Td>
            <Td className="font-semibold">{ksh(j.rider_earns)} <span className="text-[10px] font-normal text-muted">of {ksh(j.fee)}</span></Td>
            <Td className="text-ink-2">{j.delivered_at ? fmtDate(j.delivered_at) : '—'}</Td>
            <Td><StatusPill status={j.status} /></Td>
          </tr>
        ))}
      </Table>
    </Panel>
  )
}

function OfferedPanel({ offered, rider, currentJob, fetchedAt, loc, askLoc, onAccepted, onDone, goOnline }: {
  offered: Offered[]; rider: Rider; currentJob?: string | null; fetchedAt: number; loc: LocationState; askLoc: () => Promise<LocationState>
  onAccepted: () => Promise<void>; onDone: () => Promise<void>; goOnline: () => void
}) {
  const toast = useToast()
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState<number | null>(null)

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const remaining = (o: Offered) => Math.max(0, o.expires_in - Math.floor((now - fetchedAt) / 1000))
  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const accept = async (o: Offered) => {
    // Tracking was accepted at sign-in; the browser still has to allow it before a parcel is taken on.
    const where = loc === 'granted' ? loc : await askLoc()
    if (where !== 'granted') return toast.error('Allow location for this site first — the buyer follows you on the map while you deliver')
    setBusy(o.id)
    try {
      await api.post(`/rider/jobs/${o.id}/accept`)
      toast.success(`Accepted · collect from ${o.origin?.name || 'the shelf'} with your shelf code`)
      await onAccepted()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }
  const reject = async (o: Offered) => {
    setBusy(o.id)
    try {
      await api.post(`/rider/jobs/${o.id}/decline`)
      toast.success(`Rejected · ${o.tracking_no} goes to another rider`)
      await onDone()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel title="New orders" sub="Each order starts at a shelf in your ward area — accept before the timer runs out, or reject it · you earn 90% of each fee, UKO keeps 10%" action={<Chip size="sm" tone="warning">{offered.length}</Chip>} padded={false}>
      {!rider.is_online ? (
        <div className="p-5"><EmptyState icon={<Inbox size={26} />} title="You are offline" sub="Go online to be offered orders from shelves in your ward area." action={<Button size="sm" onClick={goOnline}>Go online</Button>} /></div>
      ) : currentJob ? (
        <div className="p-5"><EmptyState icon={<Navigation size={26} />} title={`You have ${currentJob} in hand`} sub="One job at a time — finish it or hand it back and new orders show up here again." /></div>
      ) : offered.length === 0 ? (
        <div className="p-5"><EmptyState icon={<Inbox size={26} />} title="No new orders right now" sub={`Paid orders with rider delivery in ${rider.wards.length ? rider.wards.join(', ') : 'your wards'} show up here.`} /></div>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
          {offered.map((o) => {
            const left = remaining(o)
            const urgent = left < 120
            const stops = o.stop_shelves?.length || 1
            return (
              <li key={o.id} className="flex flex-col gap-3 px-5 py-3.5 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-050 text-primary-600"><Package size={15} /></span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-xs font-bold text-ink">{o.origin?.name || 'Shelf'}{stops > 1 ? ` +${stops - 1} shelves` : ''}  →  {o.drops_at_shelve ? o.destination_shelve?.name : o.destination_ward} · {o.distance_km} km</span>
                    <span className="truncate text-[10px] text-ink-2">{o.tracking_no} · {o.items.length} item{o.items.length === 1 ? '' : 's'} · {o.weight_kg} kg · window {o.window_start || '—'} – {o.window_end || '—'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 md:shrink-0">
                  <span className={cx('w-[96px] text-[10px]', urgent ? 'font-bold text-danger' : 'text-muted')}>{left > 0 ? `expires in ${mmss(left)}` : 'expired'}</span>
                  <span className="flex w-[84px] flex-col">
                    <span className="font-head text-sm font-extrabold text-ink">{ksh(o.rider_earns)}</span>
                    <span className="text-[10px] text-muted">of {ksh(o.fee)} fee</span>
                  </span>
                  <Button size="sm" loading={busy === o.id} disabled={left === 0 || (busy !== null && busy !== o.id)} onClick={() => accept(o)}>Accept</Button>
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => reject(o)}>Reject</Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- Ward area
function AreaPanel({ rider, onSaved }: { rider: Rider; onSaved: (r: Rider) => void }) {
  const toast = useToast()
  const [wards, setWards] = useState<string[]>(rider.wards || [])
  const [days, setDays] = useState<string[]>(rider.days?.length ? rider.days : DAYS.slice(0, 6))
  const [hours, setHours] = useState({ start_time: rider.start_time, end_time: rider.end_time })
  const [allWards, setAllWards] = useState<string[]>([])
  const [shelves, setShelves] = useState<{ id: number; name: string; ward: string; lat: number | null; lng: number | null }[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get<{ wards: string[] }>('/wards').then((r) => setAllWards(r.wards)).catch(() => {})
    api.get<typeof shelves>('/shelves').then(setShelves).catch(() => {})
  }, [])

  const toggleDay = (d: string) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : DAYS.filter((x) => x === d || ds.includes(x))))
  const available = allWards.filter((w) => !wards.includes(w))
  const inArea = shelves.filter((s) => wards.includes(s.ward))

  const save = async () => {
    if (!wards.length) return toast.error('Keep at least one ward — with none, no orders can be offered')
    if (!days.length) return toast.error('Pick at least one working day')
    setBusy(true)
    try {
      const r = await api.put<Rider>('/rider/profile', { wards, days, ...hours })
      onSaved(r)
      toast.success('Ward area saved — new orders follow it straight away')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[520px_1fr]">
      <Panel title="Wards and hours">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save() }}>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-ink-2">Wards covered</span>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg px-3 py-2.5">
              {wards.map((w) => <Chip key={w} size="sm" tone="primary" onRemove={() => setWards(wards.filter((x) => x !== w))}>{w}</Chip>)}
              <select value="" onChange={(e) => { if (e.target.value) setWards([...wards, e.target.value]) }} className="min-w-[120px] flex-1 bg-transparent text-[12px] text-ink-2 outline-none" aria-label="Add ward">
                <option value="">+ add ward</option>
                {available.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <span className="text-[10px] text-muted">Pick wards you can reach within 45 minutes. An order is offered when its shelf is in one of them or it is going to one of them.</span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-ink-2">Working days</span>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((d) => (
                <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => toggleDay(d)} className={cx('rounded-md py-2 text-[11px] font-semibold transition-colors', days.includes(d) ? 'bg-primary text-white' : 'bg-surface-2 text-ink-2 hover:bg-border')}>{d}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start time" type="time" value={hours.start_time} onChange={(e) => setHours({ ...hours, start_time: e.target.value })} />
            <Input label="End time" type="time" value={hours.end_time} onChange={(e) => setHours({ ...hours, end_time: e.target.value })} />
          </div>
          <Button type="submit" full loading={busy}>Save ward area</Button>
        </form>
      </Panel>
      <Panel title="Shelves in your area" sub={`${inArea.length} shelf${inArea.length === 1 ? '' : 's'} you can be offered orders from`} padded={false}>
        <div className="p-4">
          <MapView height={260} points={inArea.map((s) => ({ id: `s${s.id}`, lat: s.lat, lng: s.lng, label: s.name, tone: 'success' as const }))}
                   hint={inArea.length ? undefined : 'No live shelf in these wards yet — add a neighbouring ward'} />
        </div>
        {inArea.length > 0 && (
          <ul className="m-0 flex list-none flex-col divide-y divide-border border-t border-border p-0">
            {inArea.map((s) => <li key={s.id} className="flex items-center gap-2.5 px-5 py-2.5 text-xs"><Store size={13} className="text-primary" /><span className="flex-1 font-semibold text-ink">{s.name}</span><span className="text-muted">{s.ward}</span></li>)}
          </ul>
        )}
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------- Cancel contract
function CancelContractPanel({ activeJobs, wallet, onRoute }: { activeJobs: number; wallet: number; onRoute: () => void }) {
  const toast = useToast()
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (reason.trim().length < 3) return toast.error('Tell us briefly why you are leaving')
    setBusy(true)
    try {
      await api.post('/rider/cancel-contract', { reason, confirm })
      toast.success('Your delivery contract is cancelled')
      await refresh()
      navigate({ to: '/' })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[560px_1fr]">
      <Panel title="End your delivery contract">
        {activeJobs > 0 ? (
          <Notice tone="warning" icon={<TriangleAlert size={16} />} title={`${activeJobs} job${activeJobs === 1 ? '' : 's'} still on route`} action={<Button size="sm" onClick={onRoute}>Open on-route</Button>}>
            Deliver or hand back every job you hold before you cancel — a parcel mid-route needs its rider.
          </Notice>
        ) : (
          <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); submit() }}>
            <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[12px] leading-relaxed text-ink-2">
              <li>You go offline and stop receiving orders straight away.</li>
              <li>This dashboard closes and your rider sign-in stops working.</li>
              <li>Your rider wallet ({ksh(wallet)}) stays yours — withdraw it before you go, or call the delivery team to have it paid out later.</li>
              <li>You can apply again any time from the home page.</li>
            </ul>
            <Textarea label="Why are you leaving?" required rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Moving town, found other work, fees too low…" />
            <Input label='Type CANCEL to confirm' value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} placeholder="CANCEL" />
            <Button type="submit" variant="danger" icon={<UserX size={14} />} loading={busy} disabled={confirm !== 'CANCEL'}>Cancel my contract</Button>
          </form>
        )}
      </Panel>
      <Panel title="Rather take a break?">
        <p className="m-0 text-[12px] leading-relaxed text-ink-2">Switch <strong>Online for orders</strong> off in the menu and you will not be offered anything until you switch it back on — no need to cancel. You can also shrink your ward area or working hours.</p>
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------- Profile & contacts
function ProfilePanel({ rider, onSaved }: { rider: Rider; onSaved: (r: Rider) => void }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: rider.name, phone: rider.phone, email: rider.email, alt_phone: rider.alt_phone })
  const [extra, setExtra] = useState<{ label: string; value: string }[]>([])
  const [busy, setBusy] = useState(false)

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    setBusy(true)
    try {
      const r = await api.put<Rider>('/rider/profile', form)
      onSaved(r)
      toast.success('Profile saved')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Profile & contacts">
      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          <Input label="Phone" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <Input label="Alternative phone" inputMode="tel" placeholder="07xx xxx xxx" value={form.alt_phone} onChange={(e) => set('alt_phone', e.target.value)} />
        </div>
        <Input label="UKO company email" value={rider.company_email || 'Not assigned yet'} readOnly disabled hint="Assigned by UKO when your application was approved — it is also your sign-in email. Contact support to change it" />
        {extra.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_1.4fr_auto] items-end gap-2">
            <Input label={i === 0 ? 'Contact label' : undefined} placeholder="WhatsApp" value={c.label} onChange={(e) => setExtra(extra.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <Input label={i === 0 ? 'Value' : undefined} placeholder="07xx xxx xxx" value={c.value} onChange={(e) => setExtra(extra.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
            <button type="button" aria-label="Remove contact" onClick={() => setExtra(extra.filter((_, j) => j !== i))} className="mb-[3px] flex h-10 w-10 items-center justify-center rounded-md border border-border text-ink-2 hover:text-danger"><Trash2 size={15} /></button>
          </div>
        ))}
        <div>
          <Button type="button" variant="outline" size="sm" icon={<Plus size={14} />} onClick={() => setExtra([...extra, { label: '', value: '' }])}>Add contact</Button>
        </div>
        <span className="text-[10px] text-muted">Wards and working hours are on the Ward area tab.</span>
        <Button type="submit" full loading={busy}>Save</Button>
      </form>
    </Panel>
  )
}

// ---------------------------------------------------------------- Completed
function deliveredAt(d: Delivery): string | null {
  const ev = [...(d.events || [])].reverse().find((e) => /delivered/i.test(e.title)) || d.events?.[d.events.length - 1]
  return ev?.time || null
}

function CompletedPanel({ completed }: { completed: Delivery[] }) {
  return (
    <Panel title="Completed deliveries" sub="Proof of delivery is kept for 90 days" padded={false}>
      {completed.length === 0 ? (
        <div className="p-5"><EmptyState icon={<CircleCheck size={26} />} title="No completed deliveries yet" sub="Every delivery you confirm with a buyer code, signature or photo lands here." /></div>
      ) : (
        <Table head={['Tracking', 'Order', 'Destination', 'You earned', 'Proof', 'Date', 'Status']}>
          {completed.map((d) => {
            const at = deliveredAt(d)
            return (
              <tr key={d.id}>
                <Td className="font-semibold text-ink">{d.tracking_no}</Td>
                <Td className="text-ink-2">{d.order_no}</Td>
                <Td className="text-ink-2">{d.destination_ward}{d.distance_km ? ` · ${d.distance_km} km` : ''}</Td>
                <Td className="font-semibold">{ksh(d.rider_earns)} <span className="text-[10px] font-normal text-muted">of {ksh(d.fee)}</span></Td>
                <Td className="capitalize text-ink-2">{d.proof?.type || '—'}</Td>
                <Td className="text-ink-2">{at ? fmtDate(at) : '—'}</Td>
                <Td><StatusPill status={d.status} /></Td>
              </tr>
            )
          })}
        </Table>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- Weekly earnings (shown above the wallet panel)
function EarningsStats({ stats, completed, pickups }: { stats: Stats; completed: Delivery[]; pickups: PickupJob[] }) {
  const weekAgo = useMemo(() => Date.now() - 7 * 86400_000, [])
  // Deliveries and shelf pick-ups alike, counted at what reached his wallet (the fee less UKO's 10 %).
  const trips = [
    ...completed.map((d) => ({ at: deliveredAt(d), earns: d.rider_earns || 0 })),
    ...pickups.map((j) => ({ at: j.delivered_at, earns: j.rider_earns || 0 })),
  ]
  const thisWeek = trips.filter((t) => !t.at || new Date(t.at).getTime() >= weekAgo)
  const weekTotal = thisWeek.reduce((s, t) => s + t.earns, 0) || stats.earnings_week
  const allTotal = trips.reduce((s, t) => s + t.earns, 0)
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatCard label="Earned this week" value={ksh(weekTotal)} />
        <StatCard label="Trips this week" value={thisWeek.length} />
        <StatCard label="Average per trip" value={ksh(thisWeek.length ? Math.round(weekTotal / thisWeek.length) : 0)} />
        <StatCard label="Recent total" value={ksh(allTotal)} />
      </div>
      <span className="text-[11px] text-muted">You earn {100 - (stats.commission_pct ?? 10)}% of every trip fee · UKO keeps {stats.commission_pct ?? 10}%</span>
    </div>
  )
}
