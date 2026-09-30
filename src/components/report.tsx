/**
 * Rider report: how the last 7 / 30 / 90 days went (drops, earnings, proof used) and problems sent to UKO — those land
 * in the admin console's Disputes tab under "delivery".
 */
import { useEffect, useState } from 'react'
import { Flag } from 'lucide-react'
import { api, type Delivery, type Report } from '#/lib/api'
import { useToast } from '#/lib/toast'
import { fmtDate, ksh } from '#/lib/format'
import { Button, EmptyState, Input, Select, StatCard, StatusPill, Tabs, Textarea } from './ui'
import { Panel, Table, Td } from './dashboard'

const KINDS = [
  { key: 'buyer', label: 'Buyer — not home, refused, wrong code' },
  { key: 'shelf', label: 'Shelf — closed, would not release' },
  { key: 'seller', label: 'Seller' },
  { key: 'parcel', label: 'Parcel — damaged, missing, too heavy' },
  { key: 'safety', label: 'Safety — accident, threat, theft' },
  { key: 'payment', label: 'Payment — fee or withdrawal' },
  { key: 'app', label: 'App problem' },
  { key: 'other', label: 'Something else' },
]

export function ReportPanel({ jobs, initialJob }: { jobs: Delivery[]; initialJob?: number | null }) {
  const toast = useToast()
  const [days, setDays] = useState<'7' | '30' | '90'>('30')
  const [data, setData] = useState<Report | null>(null)
  const [form, setForm] = useState({ kind: 'buyer', delivery_id: initialJob ? String(initialJob) : '', subject: '', body: '' })
  const [busy, setBusy] = useState(false)

  const load = () => api.get<Report>('/rider/report', { days }).then(setData).catch((e) => toast.error(e.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [days])
  useEffect(() => { if (initialJob) setForm((f) => ({ ...f, delivery_id: String(initialJob) })) }, [initialJob])

  const submit = async () => {
    if (form.subject.trim().length < 3 || form.body.trim().length < 5) return toast.error('Add a short subject and say what happened')
    setBusy(true)
    try {
      const r = await api.post<{ ref: string }>('/rider/report', { ...form, delivery_id: form.delivery_id ? Number(form.delivery_id) : null })
      toast.success(`Report ${r.ref} sent — the delivery team will call you`)
      setForm((f) => ({ ...f, subject: '', body: '' }))
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const t = data?.totals
  const peak = Math.max(1, ...(data?.by_day ?? []).map((d) => d.earned))

  return (
    <>
      <Tabs tabs={[{ key: '7', label: '7 days' }, { key: '30', label: '30 days' }, { key: '90', label: '90 days' }]} value={days} onChange={setDays} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6 md:gap-4">
        <StatCard label="Delivered" value={t?.delivered ?? '—'} />
        <StatCard label="Earned" value={t ? ksh(t.earned) : '—'} />
        <StatCard label="Distance" value={t ? `${t.distance_km} km` : '—'} />
        <StatCard label="In progress" value={t?.in_progress ?? '—'} />
        <StatCard label="Drops all time" value={t?.drops_all_time ?? '—'} />
        <StatCard label="Rating" value={t ? `${t.rating ? t.rating.toFixed(1) : '—'} ★` : '—'} />
      </div>

      <Panel title="Earnings per day" sub={data ? `Last ${data.days} days · proof used: ${Object.entries(data.proofs).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(' · ') || 'none yet'}` : ''}>
        {!data ? <span className="text-xs text-muted">Loading…</span> : (
          <div className="flex h-[140px] items-end gap-[3px]" role="img" aria-label="Earnings per day">
            {data.by_day.map((d) => (
              <div key={d.date} title={`${d.date} · ${d.drops} drop${d.drops === 1 ? '' : 's'} · ${ksh(d.earned)}`} className="flex h-full flex-1 flex-col justify-end">
                <div className="rounded-t-[3px] bg-primary" style={{ height: `${d.earned ? Math.max(4, (d.earned / peak) * 100) : 1}%`, opacity: d.earned ? 1 : 0.2 }} />
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[480px_1fr]">
        <Panel title="Report a problem" sub="Goes straight to the UKO delivery team">
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
            <Select label="What is it about?" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </Select>
            <Select label="Job" placeholder="Not about a specific job" value={form.delivery_id} onChange={(e) => setForm({ ...form, delivery_id: e.target.value })}>
              {jobs.map((j) => <option key={j.id} value={String(j.id)}>{j.tracking_no} · {j.order_no} · {j.status.replace(/_/g, ' ')}</option>)}
            </Select>
            <Input label="Subject" required maxLength={160} placeholder="Buyer not answering at the gate" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            <Textarea label="What happened" required rows={4} maxLength={4000} placeholder="Where you are, what you tried, and whether the parcel is safe" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <Button type="submit" icon={<Flag size={14} />} loading={busy}>Send report</Button>
            <span className="text-[10px] text-muted">In danger? Call 999 first, then the delivery team on 0700 000 111.</span>
          </form>
        </Panel>
        <Panel title="My reports" padded={false}>
          {!data || data.issues.length === 0 ? (
            <div className="p-5"><EmptyState icon={<Flag size={24} />} title="No reports sent" sub="Anything you report shows here with its status." /></div>
          ) : (
            <Table head={['Ref', 'Subject', 'Sent', 'Status']}>
              {data.issues.map((i) => (
                <tr key={i.id}>
                  <Td className="font-semibold text-ink">{i.ref}</Td>
                  <Td className="text-ink-2">{i.subject}</Td>
                  <Td className="text-ink-2">{i.time ? fmtDate(i.time) : '—'}</Td>
                  <Td><StatusPill status={i.status} /></Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </>
  )
}
