/** Rider wallet panel (GET /api/wallet?role=rider, POST /api/wallet/withdraw) — same panel design as the UKO shop consoles.
 * Withdrawals are M-PESA B2C payouts: the panel sends a random socket_key with the withdrawal, joins the sockets rooms
 * "<ConversationID>$<key>" and "<OriginatorConversationID>$<key>", sends the relayed Result to POST /api/wallet/withdrawals/{id}/confirm and polls
 * GET /api/wallet/withdrawals/{id} as a fallback. Failures (e.g. error 2001) are shown with the API's message. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Banknote, CircleAlert, CreditCard, Smartphone, Wifi, WifiOff } from 'lucide-react'
import { api, ApiError, type Wallet, type Withdrawal, type WithdrawResponse } from '#/lib/api'
import { useToast } from '#/lib/toast'
import { fmtDate, ksh } from '#/lib/format'
import { getSocket, newSocketKey, waitForB2CResult } from '#/lib/sockets'
import { Panel, Table, Td } from './dashboard'
import { Button, Chip, Input, Notice, Radio, Skeleton, Spinner, StatCard, StatusPill, cx } from './ui'

type Method = 'mpesa' | 'card'
const REASON: Record<string, string> = { sale: 'Item sold (after 20% commission)', commission: 'Shelf share of a sale (15%)', delivery_fee: 'Delivery fee', pickup_fee: 'Item pick-up to a shelf', withdrawal: 'Withdrawal', withdrawal_reversal: 'Withdrawal reversed (amount + fee returned)', seed: 'Opening balance', barter_fee: 'Barter inspection fee', storage_fee: 'Storage fee (no longer charged)', service_payment: 'Paid for a UKO service (boost, package, AI prompts)' }

export function WalletPanel({ role, methods = ['mpesa'], intro, extra }: { role: Wallet['role']; methods?: Method[]; intro?: ReactNode; extra?: ReactNode }) {
  const toast = useToast()
  const [w, setW] = useState<Wallet | null>(null)
  const [method, setMethod] = useState<Method>(methods[0])
  const [account, setAccount] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<WithdrawResponse | null>(null)
  const [failure, setFailure] = useState('')
  const load = () => api.get<Wallet>('/wallet', { role }).then((x) => { setW(x); if (!account) setAccount(x.mpesa_number || '') }).catch((e) => toast.error(e.message))
  useEffect(() => { load() }, [role]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Every withdraw / confirm / poll / simulate answer goes through here. */
  const settle = (r: WithdrawResponse) => {
    setW(r.wallet)
    const x = r.withdrawal
    if (x.status === 'approved') {
      setPending(null)
      toast.success(`${ksh(x.net)} sent to ${x.account} on M-PESA${x.fee ? ` (after ${ksh(x.fee)} fee)` : ''} · receipt ${x.receipt || 'n/a'}`)
    } else if (x.status === 'failed' || x.status === 'cancelled') {
      setPending(null)
      setFailure(x.error || r.message || 'The withdrawal was not completed. The amount is back in your wallet.')
      toast.error(x.error || r.message || 'Withdrawal failed')
    } else {
      setPending(r)
    }
  }

  const withdraw = async () => {
    const amt = Number(amount)
    if (!amt) return toast.error('Enter an amount')
    setBusy(true)
    setFailure('')
    try {
      const r = await api.post<WithdrawResponse>('/wallet/withdraw', { role, method, account, amount: amt, socket_key: newSocketKey() })
      setAmount('')
      settle(r)
      if (r.withdrawal.status === 'pending') toast.toast(r.message)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }
  if (!w) return <div className="grid gap-4 lg:grid-cols-[1fr_360px]"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
  const amt = Number(amount) || 0
  const fee = Math.floor((amt * (w.fee_pct || 0)) / 100 + 0.5) // same whole-shilling rounding as the API
  const pendingOut = w.withdrawals.filter((x) => x.status === 'pending').reduce((s, x) => s + x.amount, 0)
  return (
    <div className="flex flex-col gap-4">
      {intro}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Available balance" value={ksh(w.balance)} />
        <StatCard label="Pending withdrawals" value={ksh(pendingOut)} />
        <StatCard label="Withdrawn (all time)" value={ksh(w.withdrawals.filter((x) => x.status === 'approved').reduce((s, x) => s + x.amount, 0))} />
        <StatCard label="Minimum withdrawal" value={ksh(w.min_withdrawal)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Panel title="Recent activity" sub="Delivery fees land here the moment the buyer confirms the hand-over" padded={false}>
          {w.ledger.length === 0 ? (
            <p className="m-0 px-5 py-8 text-center text-[13px] text-ink-2">No wallet activity yet.</p>
          ) : (
            <Table head={['When', 'Reason', 'Ref', 'Amount']}>
              {w.ledger.map((e, i) => (
                <tr key={i}>
                  <Td className="text-muted">{fmtDate(e.time)}</Td>
                  <Td>{REASON[e.reason] || e.reason}</Td>
                  <Td className="text-muted">{e.ref}</Td>
                  <Td className={cx('text-right font-semibold', e.amount < 0 ? 'text-danger' : 'text-success')}>{e.amount < 0 ? '−' : '+'} {ksh(Math.abs(e.amount))}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
        <Panel title={`Withdraw${methods.length > 1 ? ' · M-PESA or card' : ' to M-PESA'}`} sub={`Minimum ${ksh(w.min_withdrawal)} · ${w.fee_pct ? `${w.fee_pct}% UKO withdrawal fee · free to spend on UKO services if UKO has linked your profile to a UKO shop account` : 'no fee'}`}>
          <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); withdraw() }}>
            {methods.length > 1 && (
              <div className="grid grid-cols-2 gap-2">
                {methods.map((m) => (
                  <button key={m} type="button" onClick={() => setMethod(m)} className={cx('flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left text-[13px] font-semibold', method === m ? 'border-primary bg-primary-050 text-primary' : 'border-border text-ink-2')}>
                    <Radio checked={method === m} /> {m === 'mpesa' ? <Smartphone size={15} /> : <CreditCard size={15} />} {m === 'mpesa' ? 'M-PESA' : 'Visa / Mastercard'}
                  </button>
                ))}
              </div>
            )}
            <Input label={method === 'mpesa' ? 'M-PESA number' : 'Card number'} placeholder={method === 'mpesa' ? '07xx xxx xxx' : '4111 **** **** 1234'} value={account} onChange={(e) => setAccount(e.target.value)} required disabled={!!pending} />
            <Input label="Amount (KSh)" type="number" min={w.min_withdrawal} max={w.balance} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(Math.min(Math.floor(w.balance), 1000))} required disabled={!!pending}
              trailing={<button type="button" className="text-[11px] font-semibold text-primary" onClick={() => setAmount(String(Math.floor(w.balance)))}>Max</button>} />
            {w.fee_pct > 0 && amt > 0 && (
              <div className="flex flex-col gap-1 rounded-md bg-surface px-3.5 py-3 text-[12px] text-ink-2">
                <div className="flex justify-between"><span>Withdrawal</span><span>{ksh(amt)}</span></div>
                <div className="flex justify-between"><span>Withdrawal fee ({w.fee_pct}%)</span><span>− {ksh(fee)}</span></div>
                <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-semibold text-ink"><span>You receive on M-PESA</span><span>{ksh(amt - fee)}</span></div>
              </div>
            )}
            {pending ? (
              <PendingWithdrawal key={pending.withdrawal.id} pending={pending} onSettled={settle} onGiveUp={() => { setPending(null); load() }} />
            ) : (
              <Button type="submit" full loading={busy} disabled={w.balance < w.min_withdrawal} icon={<Banknote size={16} />}>Withdraw {amount ? ksh(Number(amount)) : ''}</Button>
            )}
            {failure && (
              <Notice tone="danger" icon={<CircleAlert size={14} />} title="Withdrawal failed" action={<Button type="button" size="sm" variant="ghost" onClick={() => setFailure('')}>Dismiss</Button>}>{failure}</Notice>
            )}
            {w.balance < w.min_withdrawal && <Notice tone="info">Your balance is below the {ksh(w.min_withdrawal)} minimum. Delivery fees arrive as soon as the buyer confirms each drop.</Notice>}
          </form>
          {w.withdrawals.length > 0 && (
            <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
              <span className="text-xs font-semibold text-ink-2">Recent withdrawals</span>
              {w.withdrawals.slice(0, 5).map((x) => (
                <div key={x.id} className="flex flex-col gap-0.5 text-[12px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-ink-2">{x.method === 'mpesa' ? <Smartphone size={12} /> : <CreditCard size={12} />} {x.account} <Chip size="sm">{x.ref}</Chip></span>
                    <span className="flex items-center gap-2 font-semibold">{ksh(x.net ?? x.amount - (x.fee || 0))}{x.fee ? <span className="font-normal text-muted">(fee {ksh(x.fee)})</span> : null} <StatusPill status={x.status} /></span>
                  </div>
                  {x.status === 'failed' && x.error && <span className="text-[11px] text-danger">{x.error_code ? `Error ${x.error_code} · ` : ''}{x.error}</span>}
                  {x.status === 'approved' && x.receipt && <span className="text-[11px] text-muted">M-PESA receipt {x.receipt}</span>}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
      {extra}
    </div>
  )
}

/** Waits for the B2C Result on the socket rooms, confirms it with the API, polls as a fallback. */
function PendingWithdrawal({ pending, onSettled, onGiveUp, pollMs = 5000, timeoutS = 120 }: {
  pending: WithdrawResponse
  onSettled: (r: WithdrawResponse) => void
  onGiveUp: () => void
  pollMs?: number
  timeoutS?: number
}) {
  const toast = useToast()
  const x: Withdrawal = pending.withdrawal
  const ids = [x.conversation_id, x.originator_conversation_id].filter(Boolean)
  const socketKey = x.socket_key || pending.socket?.key || ''
  const [live, setLive] = useState(getSocket().connected)
  const [stage, setStage] = useState<'waiting' | 'confirming'>('waiting')
  const [seconds, setSeconds] = useState(pending.expires_in || timeoutS)
  const [simulating, setSimulating] = useState('')
  const done = useRef(false)

  const finish = (r: WithdrawResponse) => {
    if (r.withdrawal.status === 'pending' || done.current) return
    done.current = true
    onSettled(r)
  }

  useEffect(() => {
    done.current = false
    const s = getSocket()
    const on = () => setLive(true)
    const off = () => setLive(false)
    s.on('connect', on); s.on('disconnect', off)
    const waiter = waitForB2CResult(ids, socketKey, { timeoutMs: timeoutS * 1000 })
    waiter.promise.then(async ({ event, result }) => {
      setStage('confirming')
      try {
        finish(await api.post<WithdrawResponse>(`/wallet/withdrawals/${x.id}/confirm`, { event, result: { Result: result } }))
      } catch (e: any) {
        // 409 = the sockets server has not got Daraja's copy yet → the poll keeps checking
        if (!(e instanceof ApiError && e.status === 409)) toast.error(e.message)
        setStage('waiting')
      }
    }).catch(() => {})
    const poll = window.setInterval(() => { api.get<WithdrawResponse>(`/wallet/withdrawals/${x.id}`).then(finish).catch(() => {}) }, pollMs)
    const tick = window.setInterval(() => setSeconds((v) => {
      if (v <= 1) {
        window.clearInterval(tick)
        if (!done.current) { done.current = true; toast.toast('M-PESA has not confirmed yet — the withdrawal stays pending and updates in Recent withdrawals once it does.'); onGiveUp() }
        return 0
      }
      return v - 1
    }), 1000)
    return () => { waiter.cancel(); window.clearInterval(poll); window.clearInterval(tick); s.off('connect', on); s.off('disconnect', off) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x.id])

  const simulate = async (label: string, body: { event: 'results' | 'timeout'; result_code?: number }) => {
    setSimulating(label)
    try {
      const r = await api.post<WithdrawResponse>(`/wallet/withdrawals/${x.id}/simulate`, body)
      if (r.relayed === false) finish(r) // sockets server not reachable: the API settled it directly
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSimulating('')
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-primary-300 bg-primary-050 p-3.5 text-[12px]">
      <div className="flex items-center gap-2.5">
        <Spinner />
        <div className="flex min-w-0 flex-col">
          <span className="text-[13px] font-bold text-ink">{stage === 'confirming' ? 'Confirming with M-PESA…' : 'Sending your withdrawal'}</span>
          <span className="text-ink-2">{ksh(x.net)} to {x.account} · ref {x.ref}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1">{live ? <Wifi size={11} /> : <WifiOff size={11} />}{live ? 'live updates on' : 'connecting to live updates…'}</span>
        <span>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
      </div>
      {x.simulated && (
        <div className="flex flex-col gap-1.5 border-t border-primary/15 pt-2">
          <span className="text-[11px] text-muted">Simulation (no B2C credentials) — send a sample Daraja result through the sockets server:</span>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant="outline" loading={simulating === 'ok'} disabled={!!simulating} onClick={() => simulate('ok', { event: 'results', result_code: 0 })}>Success</Button>
            <Button type="button" size="sm" variant="outline" loading={simulating === '2001'} disabled={!!simulating} onClick={() => simulate('2001', { event: 'results', result_code: 2001 })}>Error 2001</Button>
            <Button type="button" size="sm" variant="outline" loading={simulating === 'timeout'} disabled={!!simulating} onClick={() => simulate('timeout', { event: 'timeout' })}>Timeout</Button>
          </div>
        </div>
      )}
    </div>
  )
}
