/**
 * UKO sockets server (Node / socket.io) — relays Daraja M-PESA callbacks to the browser.
 * The browser makes a random key (newSocketKey) and sends it with the push; the API gives Daraja
 * <sockets>/mpesa/callback?key=<key>&sig=<HMAC>, and the server emits `callback` → { data: stkCallback } into the room
 * "<MerchantRequestID>$<key>" only when the sig is valid. Join with socket.emit('user', room).
 */
import { io, type Socket } from 'socket.io-client'

export const SOCKETS_URL: string = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SOCKETS_URL) || 'https://uko-sockets.onrender.com'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKETS_URL, { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 20, timeout: 15000, autoConnect: true })
  }
  return socket
}

export type StkCallback = {
  MerchantRequestID: string
  CheckoutRequestID: string
  ResultCode: number
  ResultDesc: string
  CallbackMetadata?: { Item: { Name: string; Value: string | number }[] }
}

export type SocketLog = { at: string; event: string; detail: string }

/**
 * Random per-payment room key (128 bits, hex) from crypto.getRandomValues. Send it to the API with the STK push /
 * withdrawal: the API signs it into the Daraja webhook URLs (?key=…&sig=…) and the sockets server relays the callback /
 * payout Result only into the room "<MerchantRequestID or ConversationID>$<key>", then empties the room.
 */
export function newSocketKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const mpesaRoom = (id: string, key: string): string => `${id}$${key}`

/**
 * Join the room "<MerchantRequestID>$<key>" (key = the socket_key sent with the push) and resolve with the stkCallback when
 * Daraja's callback is relayed.
 * `onLog` receives connection / room events for the test page.
 */
export function waitForMpesaCallback(merchantRequestId: string, socketKey: string, opts: { timeoutMs?: number; onLog?: (l: SocketLog) => void; checkoutRequestId?: string } = {}): { promise: Promise<StkCallback>; cancel: () => void } {
  const room = socketKey ? mpesaRoom(merchantRequestId, socketKey) : ''
  const s = getSocket()
  const log = (event: string, detail = '') => opts.onLog?.({ at: new Date().toISOString(), event, detail })
  let done = false
  let timer: number | null = null
  const handlers: Array<[string, (...a: any[]) => void]> = []
  const off = () => { handlers.forEach(([e, h]) => s.off(e, h)); if (timer) window.clearTimeout(timer) }
  const promise = new Promise<StkCallback>((resolve, reject) => {
    const join = () => { if (room) { s.emit('user', room); log('joined room', room) } else log('no socket key', 'polling only') }
    const onConnect = () => { log('connected', s.id || ''); join() }
    const onDisconnect = (reason: string) => log('disconnected', reason)
    const onError = (err: Error) => log('connect_error', err.message)
    const onCallback = (payload: { data?: StkCallback }) => {
      const cb = payload?.data
      log('callback', JSON.stringify(cb ?? payload).slice(0, 300))
      if (!cb) return
      if (cb.MerchantRequestID !== merchantRequestId && opts.checkoutRequestId && cb.CheckoutRequestID !== opts.checkoutRequestId) return
      done = true
      off()
      resolve(cb)
    }
    handlers.push(['connect', onConnect], ['disconnect', onDisconnect], ['connect_error', onError], ['callback', onCallback])
    handlers.forEach(([e, h]) => s.on(e, h))
    if (s.connected) onConnect()
    else log('connecting', SOCKETS_URL)
    timer = window.setTimeout(() => { if (!done) { off(); reject(new Error('No M-PESA callback received through the sockets server in time')) } }, opts.timeoutMs ?? 120000)
  })
  return { promise, cancel: () => { if (!done) { done = true; off() } } }
}

/** Daraja B2C Result (wallet withdrawal payout) as relayed by the sockets server. */
export type B2CResult = {
  ResultType?: number
  ResultCode: number | string
  ResultDesc: string
  OriginatorConversationID: string
  ConversationID: string
  TransactionID?: string
  ResultParameters?: { ResultParameter: { Key: string; Value: string | number }[] | { Key: string; Value: string | number } }
}
export type B2CEvent = { event: 'results' | 'timeout'; result: B2CResult }

/**
 * Join the rooms "<ConversationID>$<key>" and "<OriginatorConversationID>$<key>" (key = the socket_key sent with the withdrawal)
 * and resolve with the first `results` / `timeout` event whose ids match either one. The sockets server replays a result
 * that arrived before the join. Without a key there is no room to join and the caller's status poll settles it.
 */
export function waitForB2CResult(ids: string[], socketKey: string, opts: { timeoutMs?: number; onLog?: (l: SocketLog) => void } = {}): { promise: Promise<B2CEvent>; cancel: () => void } {
  const s = getSocket()
  const known = ids.filter(Boolean)
  const rooms = socketKey ? known.map((id) => mpesaRoom(id, socketKey)) : []
  const log = (event: string, detail = '') => opts.onLog?.({ at: new Date().toISOString(), event, detail })
  let done = false
  let timer: number | null = null
  const handlers: Array<[string, (...a: any[]) => void]> = []
  const off = () => { handlers.forEach(([e, h]) => s.off(e, h)); if (timer) window.clearTimeout(timer) }
  const promise = new Promise<B2CEvent>((resolve, reject) => {
    const join = () => rooms.forEach((id) => { s.emit('user', id); log('joined room', id) })
    const onConnect = () => { log('connected', s.id || ''); join() }
    const handle = (event: B2CEvent['event']) => (payload: { data?: B2CResult }) => {
      const r = payload?.data
      if (!r || done) return
      if (!known.includes(r.ConversationID) && !known.includes(r.OriginatorConversationID)) return
      log(event, `ResultCode ${r.ResultCode} · ${r.ResultDesc}`)
      done = true
      off()
      resolve({ event, result: r })
    }
    handlers.push(['connect', onConnect], ['results', handle('results')], ['timeout', handle('timeout')])
    handlers.forEach(([e, h]) => s.on(e, h))
    if (s.connected) onConnect()
    timer = window.setTimeout(() => { if (!done) { done = true; off(); reject(new Error('No M-PESA payout result received through the sockets server in time')) } }, opts.timeoutMs ?? 120000)
  })
  return { promise, cancel: () => { if (!done) { done = true; off() } } }
}
