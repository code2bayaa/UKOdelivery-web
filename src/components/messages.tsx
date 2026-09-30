/**
 * Rider messages — the shop's chat_messages, organised per delivery. Each delivery has three sides: its buyer, the
 * sellers of its items and the shelves on its route. The rider writes to one side, or to all of them at once
 * ("running 10 minutes late"); each person gets it in their UKO chat. One-to-one threads stay available below.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { House, Link2Off, MessageSquare, Package, Phone, Send, Store, Tag, Users } from 'lucide-react'
import { api, type ChatMessage, type Contact, type MessageJob, type Threads } from '#/lib/api'
import { useToast } from '#/lib/toast'
import { fmtDate } from '#/lib/format'
import { Avatar, Button, Chip, EmptyState, Notice, StatusPill, Textarea, cx } from './ui'
import { Panel } from './dashboard'

const ROLE: Record<string, string> = { buyer: 'Buyer', shelf: 'Shelf', seller: 'Seller', contact: 'Contact' }
const POLL_MS = 10_000

type Audience = 'all' | 'buyer' | 'seller' | 'shelf'
const AUDIENCES: { key: Audience; label: string; icon: typeof Users }[] = [
  { key: 'all', label: 'Everyone', icon: Users },
  { key: 'buyer', label: 'Buyer', icon: House },
  { key: 'seller', label: 'Sellers', icon: Tag },
  { key: 'shelf', label: 'Shelves', icon: Store },
]
const QUICK: Record<Audience, string[]> = {
  all: ['On my way to collect', 'Collected — on the way', 'Running 10 minutes late'],
  buyer: ['Collected — on my way to you', 'Arriving in 10 minutes', 'I am at the gate'],
  seller: ['On my way to collect your item', 'Item collected safely', 'Item delivered to the buyer'],
  shelf: ['Arriving at the shelf in 10 minutes', 'I am at the shelf counter', 'Please have the parcel ready'],
}

/** A person (`user:<users id>`) or a delivery (`job:<key>`, key = "d<delivery id>" or "p<pick-up id>"). */
export type MessageTarget = `user:${number}` | `job:${string}`

export function MessagesPanel({ initial, onUnread }: { initial?: MessageTarget | null; onUnread?: (n: number) => void }) {
  const toast = useToast()
  const [data, setData] = useState<Threads | null>(null)
  const [target, setTarget] = useState<MessageTarget | null>(initial ?? null)
  const [audience, setAudience] = useState<Audience>('all')
  const [thread, setThread] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  const load = async () => {
    try {
      const d = await api.get<Threads>('/rider/messages')
      setData(d)
      onUnread?.(d.unread)
    } catch {}
  }
  useEffect(() => {
    load()
    const t = window.setInterval(load, POLL_MS)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (initial) { setTarget(initial); setAudience('all') } }, [initial])

  const person = target?.startsWith('user:') ? Number(target.slice(5)) : null
  const job: MessageJob | undefined = target?.startsWith('job:') ? data?.jobs.find((j) => j.key === target.slice(4)) : undefined
  const contacts = data?.contacts ?? []
  const byId = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c])), [contacts])
  const current: Contact | undefined = person != null ? byId[person] : undefined
  const recipients = job ? (audience === 'all' ? job.people : job.groups[audience]) : person != null ? [person] : []

  // A person's thread is fetched (and marked read) when opened and on every poll while open.
  useEffect(() => {
    if (person == null) return setThread([])
    let live = true
    const get = () => api.get<{ messages: ChatMessage[] }>(`/rider/messages/${person}`).then((r) => { if (live) setThread(r.messages) }).catch(() => {})
    get().then(load)
    const t = window.setInterval(get, POLL_MS)
    return () => { live = false; window.clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [thread.length])

  const send = async () => {
    const msg = text.trim()
    if (!msg || !recipients.length) return
    setBusy(true)
    try {
      const r = await api.post<{ sent: number; messages: ChatMessage[] }>('/rider/messages', { to: recipients, message: msg })
      setText('')
      if (person != null) setThread((t) => [...t, ...r.messages])
      else toast.success(`Sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'} on ${job?.tracking_no}`)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const jobs = [...(data?.jobs ?? [])].filter((j) => j.people.length).sort((a, b) => Number(b.active) - Number(a.active))
  const pick = (j: MessageJob) => { setTarget(`job:${j.key}`); setAudience('all') }

  // Chat lives on UKO shop accounts: a rider profile staff have not linked to one has nobody to write as.
  if (data && data.linked === false) {
    return (
      <Panel title="Messages">
        <Notice tone="info" icon={<Link2Off size={16} />} title="Messages are not available on your profile yet">
          {data.note || 'Call the delivery team on 0700 000 111.'}
        </Notice>
      </Panel>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div className="flex flex-col gap-4">
        <Panel title="Deliveries" sub="Message a delivery's buyer, sellers or shelves" padded={false}>
          {!data ? (
            <div className="p-5 text-xs text-muted">Loading…</div>
          ) : jobs.length === 0 ? (
            <div className="p-5"><EmptyState icon={<Package size={24} />} title="No deliveries yet" sub="Accept a job — its buyer, sellers and shelves appear here." /></div>
          ) : (
            <ul className="m-0 flex max-h-[360px] list-none flex-col overflow-y-auto p-2">
              {jobs.map((j) => (
                <li key={j.key}>
                  <button type="button" onClick={() => pick(j)} className={cx('flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left', job?.key === j.key ? 'bg-primary-050' : 'hover:bg-surface')}>
                    <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', j.active ? 'bg-secondary/15 text-secondary' : 'bg-surface-2 text-muted')}><Package size={15} /></span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-xs font-bold text-ink">{j.tracking_no}{j.kind === 'pickup' ? ' · pick-up' : ''}</span>
                      <span className="truncate text-[10px] text-muted">
                        {[j.groups.buyer.length && `${j.groups.buyer.length} buyer`, j.groups.seller.length && `${j.groups.seller.length} seller${j.groups.seller.length === 1 ? '' : 's'}`, j.groups.shelf.length && `${j.groups.shelf.length} shel${j.groups.shelf.length === 1 ? 'f' : 'ves'}`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <StatusPill status={j.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Conversations" sub="One-to-one" padded={false}>
          {contacts.length === 0 ? (
            <div className="p-5 text-xs text-muted">{data ? 'No one to message yet.' : 'Loading…'}</div>
          ) : (
            <ul className="m-0 flex max-h-[360px] list-none flex-col overflow-y-auto p-2">
              {contacts.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setTarget(`user:${c.id}`)} className={cx('flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left', person === c.id ? 'bg-primary-050' : 'hover:bg-surface')}>
                    <Avatar name={c.name} src={c.avatar} size={32} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-bold text-ink">{c.name}</span>
                        {c.roles.map((r) => <span key={r} className="text-[9px] font-semibold uppercase text-muted">{ROLE[r]}</span>)}
                      </span>
                      <span className="truncate text-[10px] text-muted">{c.last ? `${c.last.mine ? 'You: ' : ''}${c.last.message}` : c.jobs.join(', ')}</span>
                    </span>
                    {c.unread > 0 && <Chip size="sm" tone="primary">{c.unread}</Chip>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title={job ? `${job.tracking_no} · message ${AUDIENCES.find((a) => a.key === audience)!.label.toLowerCase()}` : current ? current.name : 'Messages'}
        sub={job ? `${recipients.length} ${recipients.length === 1 ? 'person' : 'people'} · each gets the message in their UKO chat` : current ? `${current.roles.map((r) => ROLE[r]).join(' · ')} · ${current.jobs.join(', ')}` : 'Pick a delivery or a conversation'}
        action={current?.phone ? <a href={`tel:${current.phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface"><Phone size={12} /> Call</a> : undefined}
      >
        {!target || (!job && person == null) ? (
          <EmptyState icon={<MessageSquare size={26} />} title="Pick a delivery" sub="Then write to its buyer, its sellers, its shelves — or everyone on it at once." />
        ) : (
          <div className="flex flex-col gap-3">
            {job && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Who gets the message">
                  {AUDIENCES.map((a) => {
                    const n = a.key === 'all' ? job.people.length : job.groups[a.key].length
                    const on = audience === a.key
                    return (
                      <button key={a.key} type="button" role="radio" aria-checked={on} disabled={!n} onClick={() => setAudience(a.key)}
                              className={cx('flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-40',
                                on ? 'border-primary bg-primary-050 text-primary-600' : 'border-border text-ink-2 hover:border-primary-300')}>
                        <a.icon size={13} /> {a.label} <span className="text-muted">{n}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recipients.map((id) => byId[id] && (
                    <button key={id} type="button" title="Open a one-to-one chat" onClick={() => setTarget(`user:${id}`)} className="rounded-full">
                      <Chip size="sm">{byId[id].name} · {(['buyer', 'seller', 'shelf'] as const).filter((g) => job.groups[g].includes(id)).map((g) => ROLE[g]).join('/')}</Chip>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK[audience].map((q) => (
                    <button key={q} type="button" onClick={() => setText(q)} className="rounded-full border border-border px-3 py-1 text-[11px] text-ink-2 hover:border-primary hover:text-primary">{q}</button>
                  ))}
                </div>
              </>
            )}
            {person != null && (
              <div className="flex max-h-[420px] min-h-[200px] flex-col gap-2 overflow-y-auto rounded-md bg-surface p-3">
                {thread.length === 0 && <span className="m-auto text-xs text-muted">No messages yet — say hello.</span>}
                {thread.map((m) => (
                  <div key={m.id} className={cx('flex max-w-[80%] flex-col gap-0.5 rounded-lg px-3 py-2', m.mine ? 'self-end bg-primary text-white' : 'self-start bg-bg text-ink')}>
                    <span className="whitespace-pre-wrap text-[13px] leading-snug">{m.message}</span>
                    <span className={cx('text-[9px]', m.mine ? 'text-white/70' : 'text-muted')}>{m.time ? fmtDate(m.time) : ''}</span>
                  </div>
                ))}
                <div ref={end} />
              </div>
            )}
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send() }}>
              <Textarea className="flex-1" rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)}
                        placeholder={job ? `Message ${audience === 'all' ? 'everyone on' : `the ${AUDIENCES.find((a) => a.key === audience)!.label.toLowerCase()} of`} ${job.tracking_no}…` : 'Write a message…'}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
              <Button type="submit" icon={<Send size={14} />} loading={busy} disabled={!text.trim() || !recipients.length}>Send</Button>
            </form>
          </div>
        )}
      </Panel>
    </div>
  )
}
