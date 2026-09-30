/**
 * UKO goods cover for riders: what is covered, filing a claim for a parcel lost, damaged or stolen in his custody, and
 * the claims he has filed. Staff decide and pay claims in the admin console.
 */
import { useEffect, useState } from 'react'
import { Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { api, type Delivery, type InsuranceClaim, type InsuranceCover, type PickupJob } from '#/lib/api'
import { useToast } from '#/lib/toast'
import { fmtDate, ksh } from '#/lib/format'
import { Button, EmptyState, Input, Notice, Select, StatusPill, Textarea, cx } from './ui'
import { Panel, Table, Td } from './dashboard'
import { UploadTile } from './media'

type Line = { title: string; code: string; value: string }
const KINDS = [
  { key: 'lost', label: 'Lost', sub: 'The parcel went missing' },
  { key: 'damaged', label: 'Damaged', sub: 'Broken, wet or crushed' },
  { key: 'stolen', label: 'Stolen', sub: 'Taken from you — report to police first' },
] as const

export function InsurancePanel({ jobs, pickups, initialJob }: { jobs: Delivery[]; pickups: PickupJob[]; initialJob?: number | null }) {
  const toast = useToast()
  const [data, setData] = useState<{ cover: InsuranceCover; claims: InsuranceClaim[] } | null>(null)
  const [kind, setKind] = useState<'lost' | 'damaged' | 'stolen'>('damaged')
  const [ref, setRef] = useState(initialJob ? `delivery:${initialJob}` : '')
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [evidence, setEvidence] = useState<string[]>([])
  const [police, setPolice] = useState({ station: '', ob: '' })
  const [busy, setBusy] = useState(false)

  const load = () => api.get<typeof data>('/insurance').then(setData).catch((e) => toast.error(e.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])
  useEffect(() => { if (initialJob) setRef(`delivery:${initialJob}`) }, [initialJob])

  // Picking a delivery fills its items in; the rider can still correct them.
  useEffect(() => {
    const [type, id] = ref.split(':')
    if (type === 'delivery') {
      const d = jobs.find((j) => j.id === Number(id))
      if (d) setLines(d.items.map((it) => ({ title: `${it.title}${it.variant_label ? `, ${it.variant_label}` : ''}`, code: it.code, value: String(Math.round((it.amount || 0) * (it.quantity || 1))) })))
    } else if (type === 'pickup_job') {
      const j = pickups.find((p) => p.id === Number(id))
      if (j?.item) setLines([{ title: j.item.title, code: '', value: '' }])
    }
  }, [ref, jobs, pickups])

  const total = lines.reduce((s, l) => s + (Number(l.value) || 0), 0)
  const limit = data?.cover.limit ?? 0

  const submit = async () => {
    const [type, id] = ref ? ref.split(':') : ['other', '']
    if (description.trim().length < 10) return toast.error('Say what happened in a sentence or two')
    if (!lines.length || total <= 0) return toast.error('Add the items and what they are worth')
    if (kind === 'stolen' && !police.ob.trim()) return toast.error('Report the theft to the police and add the OB number')
    setBusy(true)
    try {
      const c = await api.post<InsuranceClaim>('/insurance/claims', {
        kind, ref_type: type || 'other', ref_id: id ? Number(id) : null, description,
        items: lines.filter((l) => l.title.trim()).map((l) => ({ title: l.title.trim(), code: l.code, value: Number(l.value) || 0 })),
        evidence, police_station: police.station, police_ob: police.ob,
      })
      toast.success(`Claim ${c.claim_no} filed — the delivery team reviews it within 3 working days`)
      setDescription(''); setEvidence([]); setPolice({ station: '', ob: '' }); setRef(''); setLines([])
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Notice tone="success" icon={<ShieldCheck size={16} />} title={data ? `Covered up to ${ksh(data.cover.limit)} per claim` : 'UKO goods cover'}>
        {data?.cover.summary ?? 'Loading your cover…'}
        {data && data.cover.excess > 0 && ` An excess of ${ksh(data.cover.excess)} is deducted from each payout.`}
      </Notice>

      <div className="grid gap-4 xl:grid-cols-[520px_1fr]">
        <Panel title="File a claim" sub="For a parcel lost, damaged or stolen while you had it">
          <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); submit() }}>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="What happened">
              {KINDS.map((k) => (
                <button key={k.key} type="button" role="radio" aria-checked={kind === k.key} onClick={() => setKind(k.key)}
                        className={cx('flex flex-col items-start gap-0.5 rounded-md border px-3 py-2.5 text-left transition-colors', kind === k.key ? 'border-primary bg-primary-050' : 'border-border hover:border-primary-300')}>
                  <span className="text-xs font-bold text-ink">{k.label}</span>
                  <span className="text-[10px] leading-snug text-muted">{k.sub}</span>
                </button>
              ))}
            </div>
            <Select label="Which job" placeholder="Not a specific job" value={ref} onChange={(e) => setRef(e.target.value)}>
              {jobs.map((j) => <option key={`d${j.id}`} value={`delivery:${j.id}`}>{j.tracking_no} · {j.order_no} · {j.status.replace(/_/g, ' ')}</option>)}
              {pickups.map((j) => <option key={`p${j.id}`} value={`pickup_job:${j.id}`}>{j.job_no} · pick-up · {j.item?.title || ''}</option>)}
            </Select>
            <Textarea label="What happened" required rows={3} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)}
                      placeholder="Where and when, what state the parcel is in, who you told" />
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-ink-2">Items and value (KSh)</span>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_110px_auto] items-end gap-2">
                  <Input placeholder="Item" value={l.title} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <Input placeholder="Value" inputMode="numeric" value={l.value} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, value: e.target.value.replace(/[^\d.]/g, '') } : x)))} />
                  <button type="button" aria-label="Remove item" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="mb-[3px] flex h-10 w-10 items-center justify-center rounded-md border border-border text-ink-2 hover:text-danger"><Trash2 size={15} /></button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button type="button" size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => setLines([...lines, { title: '', code: '', value: '' }])}>Add item</Button>
                <span className={cx('text-xs font-bold', limit && total > limit ? 'text-danger' : 'text-ink')}>Total {ksh(total)}{limit && total > limit ? ` · cover pays up to ${ksh(limit)}` : ''}</span>
              </div>
            </div>
            <UploadTile label="Photos / police abstract" value={evidence} max={5} onChange={setEvidence} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Police station" value={police.station} onChange={(e) => setPolice({ ...police, station: e.target.value })} placeholder="Kilimani Police Station" />
              <Input label="OB number" required={kind === 'stolen'} value={police.ob} onChange={(e) => setPolice({ ...police, ob: e.target.value })} placeholder="OB 12/22/09/2026" />
            </div>
            <Button type="submit" icon={<ShieldCheck size={14} />} loading={busy}>File claim</Button>
          </form>
        </Panel>

        <Panel title="My claims" padded={false}>
          {!data || data.claims.length === 0 ? (
            <div className="p-5"><EmptyState icon={<ShieldCheck size={24} />} title="No claims filed" sub="Claims you file show here with the decision and the payout." /></div>
          ) : (
            <Table head={['Claim', 'Job', 'What', 'Claimed', 'Payable', 'Status', 'Filed']}>
              {data.claims.map((c) => (
                <tr key={c.id}>
                  <Td className="font-semibold text-ink">{c.claim_no}</Td>
                  <Td className="text-ink-2">{c.ref_no || '—'}</Td>
                  <Td className="capitalize text-ink-2">{c.kind}</Td>
                  <Td>{ksh(c.amount_claimed)}</Td>
                  <Td className="font-semibold">{ksh(c.payable)}</Td>
                  <Td><StatusPill status={c.status} />{c.decision_note && <span className="mt-1 block max-w-[200px] text-[10px] text-muted">{c.decision_note}</span>}</Td>
                  <Td className="text-ink-2">{c.created_at ? fmtDate(c.created_at) : '—'}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </>
  )
}
