import { useEffect, useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Bike, Car, CircleCheck, ClipboardList, Footprints, LogIn, Truck, type LucideIcon } from 'lucide-react'
import { api, SHOP_URL, type Application, type Shelve } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useToast } from '#/lib/toast'
import { Button, Card, Checkbox, Chip, Input, LinkButton, Notice, Select, cx } from '#/components/ui'
import { UploadTile } from '#/components/media'

/** Apply for delivery — guests only. Approval emails a set-password link to the company email UKO assigns. */
export const Route = createFileRoute('/')({ component: ApplyPage })

// ---------------------------------------------------------------- form model (DeliveryApplyIn)
type Form = {
  full_name: string; national_id: string; phone: string; alt_phone: string; email: string; emergency_contact: string
  vehicle_type: string; number_plate: string; parcel_capacity: string; base_shelve_id: string; start_time: string; end_time: string
  payout_method: string; payout_number: string
}
const EMPTY: Form = {
  full_name: '', national_id: '', phone: '', alt_phone: '', email: '', emergency_contact: '',
  vehicle_type: 'motorbike', number_plate: '', parcel_capacity: '5', base_shelve_id: '', start_time: '08:00', end_time: '18:00',
  payout_method: 'mpesa', payout_number: '',
}
type Docs = { licence: string[]; id: string[]; logbook: string[]; insurance: string[]; good_conduct: string[] }
type Geo = { wards: string[]; counties: string[] }

const VEHICLES: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'motorbike', label: 'Motorbike', icon: Bike },
  { key: 'bicycle', label: 'Bicycle', icon: Bike },
  { key: 'car', label: 'Car', icon: Car },
  { key: 'van', label: 'Van / pickup', icon: Truck },
  { key: 'foot', label: 'On foot', icon: Footprints },
]
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const RATES = [
  { label: 'Within the ward', value: 'KSh 120 / drop' },
  { label: 'Neighbouring ward', value: 'KSh 180 / drop' },
  { label: 'Upcountry hand-off', value: 'KSh 250 / parcel' },
]
const HOW = [
  { title: 'Job offered', sub: 'You get a push with the shelf, ward and fee' },
  { title: 'Collect', sub: 'Enter the shelf hand-off code to sign out the parcel' },
  { title: 'Deliver', sub: "Buyer confirms with their rider code, a signature or a door photo" },
  { title: 'Get paid', sub: 'The fee lands in your rider wallet — withdraw to M-PESA' },
]

function ApplyPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState<Form>(EMPTY)
  const [wards, setWards] = useState<string[]>([])
  const [days, setDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  const [docs, setDocs] = useState<Docs>({ licence: [], id: [], logbook: [], insurance: [], good_conduct: [] })
  const [agree, setAgree] = useState(false)
  const [geo, setGeo] = useState<Geo>({ wards: [], counties: [] })
  const [shelves, setShelves] = useState<Shelve[]>([])
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<Application | null>(null)

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    api.get<Geo>('/wards').then(setGeo).catch(() => {})
    api.get<Shelve[]>('/shelves').then(setShelves).catch(() => {})
  }, [])

  const toggleDay = (d: string) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : DAYS.filter((x) => x === d || ds.includes(x))))
  const availableWards = geo.wards.filter((w) => !wards.includes(w))

  const payload = () => ({
    ...form,
    parcel_capacity: Number(form.parcel_capacity) || 1,
    base_shelve_id: form.base_shelve_id ? Number(form.base_shelve_id) : null,
    wards,
    days,
    documents: { licence: docs.licence[0] || '', id: docs.id, logbook: docs.logbook[0] || '', insurance: docs.insurance[0] || '', good_conduct: docs.good_conduct[0] || '' },
  })

  const save = async (mode: 'draft' | 'submit') => {
    setErr('')
    if (mode === 'submit') {
      if (!form.full_name.trim() || !form.phone.trim()) return setErr('Add your name and phone number so we can reach you.')
      if (!wards.length) return setErr('Add at least one ward you can cover.')
      if (!agree) return setErr('Accept the UKO delivery terms to submit.')
    } else if (!form.full_name.trim()) {
      return setErr('Add at least your name to save a draft.')
    }
    setBusy(mode)
    try {
      const r = await api.post<Application>('/apply/delivery', { ...payload(), agree, draft: mode === 'draft' })
      if (mode === 'draft') toast.success('Draft saved')
      else {
        setDone(r)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (e: any) {
      setErr(e.message || 'Could not send the application')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bg-surface">
      <section className="grad-hero">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-8 md:flex-row md:items-center md:gap-10 md:py-9 lg:px-6">
          <div className="flex flex-1 flex-col gap-3">
            <Chip size="sm" className="w-fit bg-white/15 text-white">Deliver for UKO</Chip>
            <h1 className="text-[30px] leading-tight text-white md:text-[38px]">Apply for delivery</h1>
            <p className="m-0 max-w-[560px] text-sm leading-relaxed text-white/80">Pick up parcels from the shelf in your ward and deliver them the same day. Short routes, fixed rates, weekly payouts.</p>
          </div>
          <div className="flex w-full flex-col gap-2.5 rounded-lg border border-white/20 bg-white/10 p-5 md:w-[300px]">
            {RATES.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-3">
                <span className="text-xs text-white/70">{r.label}</span>
                <span className="font-head text-[13px] font-bold text-white">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-[1200px] gap-7 px-4 py-8 lg:grid-cols-[1fr_340px] lg:px-6 lg:pb-12">
        {done ? (
          <Received app={done} phone={form.phone} />
        ) : user?.is_rider ? (
          <Card className="flex flex-col gap-4 p-6 md:p-8">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-050 text-success"><CircleCheck size={28} /></span>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[22px]">You're already a UKO delivery partner</h2>
              <p className="m-0 text-sm text-ink-2">Go online on your dashboard to be offered jobs from shelves in your wards.</p>
            </div>
            <div><LinkButton to="/dashboard">Open delivery dashboard</LinkButton></div>
          </Card>
        ) : (
          <form className="flex min-w-0 flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save('submit') }}>
            <Notice tone="info" icon={<ClipboardList size={16} />} title="Apply first — no account needed">
              Send your application now. When UKO approves it, you are given a <strong>UKO company email</strong> and we email a link there to set your password. You then sign in to this app with that company email — no other account is needed.
            </Notice>

            <Section title="Rider details" sub="The person or company that will collect parcels from the shelf">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Full name / company" required placeholder="As on your ID or registration" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
                <Input label="National ID / registration no." placeholder="8 digits or company reg." value={form.national_id} onChange={(e) => set('national_id', e.target.value)} />
                <Input label="Phone number" required inputMode="tel" placeholder="07xx xxx xxx" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                <Input label="Alternative phone" inputMode="tel" placeholder="07xx xxx xxx" value={form.alt_phone} onChange={(e) => set('alt_phone', e.target.value)} />
                <Input label="Email" type="email" placeholder="you@example.com" hint="So we can reach you about your application" value={form.email} onChange={(e) => set('email', e.target.value)} />
                <Input label="Emergency contact" placeholder="Name · 07xx xxx xxx" value={form.emergency_contact} onChange={(e) => set('emergency_contact', e.target.value)} />
              </div>
            </Section>

            <Section title="Vehicle & coverage" sub="Pick the wards you can reach within 45 minutes of the shelf">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-ink-2">Vehicle type</span>
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5" role="radiogroup" aria-label="Vehicle type">
                  {VEHICLES.map((v) => {
                    const on = form.vehicle_type === v.key
                    return (
                      <button key={v.key} type="button" role="radio" aria-checked={on} onClick={() => set('vehicle_type', v.key)} className={cx('flex flex-col items-center gap-1.5 rounded-md border px-2 py-3.5 text-[11px] transition-colors', on ? 'border-primary bg-primary-050 font-bold text-primary-600' : 'border-border bg-bg font-medium text-ink-2 hover:border-primary-300')}>
                        <v.icon size={20} className={on ? 'text-primary-600' : 'text-muted'} />
                        {v.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input label="Number plate" placeholder="KMFC 442T" value={form.number_plate} onChange={(e) => set('number_plate', e.target.value.toUpperCase())} />
                <Input label="Parcel capacity per trip" inputMode="numeric" value={form.parcel_capacity} onChange={(e) => set('parcel_capacity', e.target.value.replace(/\D/g, ''))} />
                <Select label="Base shelf" placeholder="Nearest live shelf" value={form.base_shelve_id} onChange={(e) => set('base_shelve_id', e.target.value)}>
                  {shelves.map((s) => <option key={s.id} value={String(s.id)}>{s.name} · {s.ward}</option>)}
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-ink-2">Wards you can cover <span className="text-danger">*</span></span>
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg px-3 py-2.5">
                  {wards.map((w) => <Chip key={w} size="sm" tone="primary" onRemove={() => setWards(wards.filter((x) => x !== w))}>{w}</Chip>)}
                  <select value="" onChange={(e) => { if (e.target.value) setWards([...wards, e.target.value]) }} className="min-w-[120px] flex-1 bg-transparent text-[12px] text-ink-2 outline-none" aria-label="Add ward">
                    <option value="">+ add ward</option>
                    {availableWards.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-ink-2">Availability</span>
                <div className="grid grid-cols-7 gap-1.5">
                  {DAYS.map((d) => (
                    <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => toggleDay(d)} className={cx('rounded-md py-2 text-[11px] font-semibold transition-colors', days.includes(d) ? 'bg-primary text-white' : 'bg-surface-2 text-ink-2 hover:bg-border')}>{d}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Start time" type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} />
                <Input label="End time" type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} />
              </div>
            </Section>

            <Section title="Documents" sub="Uploads are checked against NTSA and insurance records">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <UploadTile label="Driving licence" value={docs.licence} onChange={(v) => setDocs({ ...docs, licence: v })} />
                <UploadTile label="National ID" value={docs.id} max={2} onChange={(v) => setDocs({ ...docs, id: v })} />
                <UploadTile label="Vehicle logbook" value={docs.logbook} onChange={(v) => setDocs({ ...docs, logbook: v })} />
                <UploadTile label="Insurance cover" value={docs.insurance} onChange={(v) => setDocs({ ...docs, insurance: v })} />
                <UploadTile label="Good conduct" value={docs.good_conduct} onChange={(v) => setDocs({ ...docs, good_conduct: v })} />
              </div>
            </Section>

            <Section title="Payout & agreement" sub="Delivery fees land in your rider wallet · 10% fee on each M-PESA withdrawal">
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Payout method" value={form.payout_method} onChange={(e) => set('payout_method', e.target.value)}>
                  <option value="mpesa">M-PESA</option>
                  <option value="bank">Bank</option>
                </Select>
                <Input label="Payout number" placeholder={form.payout_method === 'bank' ? 'Account number' : '07xx xxx xxx'} value={form.payout_number} onChange={(e) => set('payout_number', e.target.value)} />
              </div>
              <div className="rounded-sm bg-surface p-3">
                <Checkbox checked={agree} onChange={setAgree} label={<span className="text-[11px] leading-relaxed">I accept the UKO delivery terms: I collect parcels only with a shelf hand-off code, deliver within the agreed window, capture proof of delivery for every drop, and accept that a 10% fee is deducted from every M-PESA withdrawal from my rider wallet.</span>} />
              </div>
            </Section>

            {err && <Notice tone="danger">{err}</Notice>}

            <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <span className="flex-1 text-[11px] text-muted">Approval takes 2 working days. You'll do a short onboarding call before your first pickup.</span>
              <div className="flex gap-2.5">
                <Button type="button" variant="outline" className="flex-1 sm:flex-none" loading={busy === 'draft'} disabled={busy === 'submit'} onClick={() => save('draft')}>Save draft</Button>
                <Button type="submit" size="lg" className="flex-1 sm:flex-none" loading={busy === 'submit'} disabled={busy === 'draft'}>Submit application</Button>
              </div>
            </Card>
          </form>
        )}

        <aside className="flex flex-col gap-4">
          {!user && (
            <Card className="flex flex-col gap-3">
              <h3 className="text-[15px]">Already a delivery partner?</h3>
              <p className="m-0 text-[12px] leading-relaxed text-ink-2">Sign in to see jobs offered from shelves in your wards, confirm pickups and drops, and withdraw your fees.</p>
              <LinkButton to="/login" variant="outline" icon={<LogIn size={14} />}>Rider sign in</LinkButton>
            </Card>
          )}
          <Card className="flex flex-col gap-3.5">
            <h3 className="text-[15px]">How a delivery runs</h3>
            {HOW.map((h, i) => <Step key={h.title} n={i + 1} title={h.title} sub={h.sub} />)}
          </Card>
          <div className="grad-soft flex flex-col gap-2 rounded-lg p-5">
            <h3 className="text-[15px]">Questions?</h3>
            <p className="m-0 text-[12px] leading-relaxed text-ink-2">Call the delivery team on <a href="tel:0700000111" className="font-semibold text-primary-600">0700 000 111</a> or read the <a href={`${SHOP_URL}/help`} className="font-semibold text-primary-600 hover:underline">UKO help centre</a>.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Received({ app, phone }: { app: Application; phone: string }) {
  return (
    <Card className="flex flex-col gap-4 p-6 md:p-8">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-050 text-success"><CircleCheck size={28} /></span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[22px]">Application received</h2>
        <p className="m-0 text-sm text-ink-2">Reference <strong className="text-ink">{app.ref}</strong>. Approval takes 2 working days. You'll do a short onboarding call on {phone} before your first pickup.</p>
        <p className="m-0 text-sm text-ink-2">Once approved, UKO assigns you a company email and sends a link there to set your password. Sign in with that company email — you'll be asked to accept location tracking, then your orders open.</p>
      </div>
      <div className="flex flex-col gap-3 rounded-md bg-surface p-4">
        <span className="text-xs font-bold text-ink">Once approved, a delivery runs like this</span>
        {HOW.map((h, i) => <Step key={h.title} n={i + 1} title={h.title} sub={h.sub} />)}
      </div>
      <div className="flex flex-wrap gap-2.5">
        <LinkButton to="/login" icon={<LogIn size={14} />}>Rider sign in</LinkButton>
      </div>
    </Card>
  )
}

function Step({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-primary-050 text-[11px] font-bold text-primary-600">{n}</span>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-bold text-ink">{title}</span>
        <span className="text-[11px] leading-relaxed text-ink-2">{sub}</span>
      </div>
    </div>
  )
}

function Section({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base">{title}</h2>
        <p className="m-0 text-xs text-ink-2">{sub}</p>
      </div>
      {children}
    </Card>
  )
}
