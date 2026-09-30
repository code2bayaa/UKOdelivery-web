/**
 * Fetch wrapper for the UKO delivery API (delivery/back-end).
 *  - sends the rider session token (localStorage "uko_delivery_token") — riders sign in with their own account (company
 *    email + password + e-mailed code), not a UKO shop account
 *  - on 401 (expired / revoked session) clears the token and fires "uko-delivery:signed-out" so the app returns to /login
 *  - throws ApiError with the server's `detail` message
 */
// 127.0.0.1, not localhost: run.ps1's uvicorn binds IPv4 loopback only, and a browser may resolve localhost to ::1.
export const API_URL: string = import.meta.env.VITE_DELIVERY_API_URL || 'http://127.0.0.1:8014'
/** The UKO shop — only for the help centre; riders never need a shop account. */
export const SHOP_URL: string = import.meta.env.VITE_SHOP_URL || 'http://localhost:3000'

const TOKEN_KEY = 'uko_delivery_token'
export const SIGNED_OUT_EVENT = 'uko-delivery:signed-out'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {}
}

type Query = Record<string, string | number | boolean | undefined | null>

export function qs(params?: Query): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

/**
 * A FastAPI 422 body carries `detail` as a list of { loc, msg } rather than a sentence, and two things
 * make those unreadable as they arrive: pydantic puts "Value error, " in front of whatever our own
 * validator wrote, and `loc` is a path whose first element is always "body". So drop the prefix, turn
 * the rest of the path into words, and leave the field name off when the message already opens with it —
 * "Gender must be male or female" needs nothing in front of it, pydantic's own "Field required" does.
 */
const PYDANTIC_PREFIX = /^(?:Value error|Assertion failed),\s+/

function validationMessage(d: any): string {
  const msg = String(d?.msg || 'is not valid').replace(PYDANTIC_PREFIX, '')
  const path = (Array.isArray(d?.loc) ? d.loc : []).slice(1)
  // A position in a list is counted from 1, the way the person sees the rows on the page.
  const field = path.map((p: unknown) => (typeof p === 'number' ? `[${p + 1}]` : String(p).replace(/_/g, ' '))).join(' ').trim()
  if (!field) return msg
  if (msg.toLowerCase().startsWith(field.split(' [')[0].toLowerCase())) return msg
  return `${field.charAt(0).toUpperCase()}${field.slice(1)}: ${msg}`
}

async function request<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (form) payload = form
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  let res: Response
  try {
    res = await fetch(`${API_URL}/api${path}`, { method, headers, body: payload })
  } catch {
    throw new ApiError(0, `The delivery API is not reachable at ${API_URL} — start delivery/back-end (run.ps1).`)
  }
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null)
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
    }
    const detail = data?.detail
    const msg = Array.isArray(detail)
      ? detail.map(validationMessage).join('; ')
      : detail || res.statusText || 'Request failed'
    throw new ApiError(res.status, msg)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, params?: Query) => request<T>('GET', path + qs(params)),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ path: string; url: string; kind: 'image' }>('POST', '/upload', undefined, form)
  },
}

// ---------------------------------------------------------------- types
export type Application = { id: number; ref: string; status: 'draft' | 'pending' | 'approved' | 'rejected'; full_name: string; phone: string; vehicle_type: string; wards: string[]; submitted_at: string | null }
export type Rider = {
  id: number; name: string; phone: string; alt_phone: string; email: string; vehicle_type: string; number_plate: string; rating: number; drops: number
  wards: string[]; days: string[]; start_time: string; end_time: string; is_online: boolean; status: string; avatar: string; company_email: string
  /** Staff may link a rider profile to a UKO shop account (chat with buyers, spending the wallet on UKO services in the shop). */
  users_id?: number | null; linked?: boolean; mpesa_number?: string
}
/** GET /api/auth/me — the rider account signed in to the delivery app. `id` is the account id, `email` the company email;
 *  `application` is always null (applicants never sign in). */
export type Me = { id: number; name: string; email: string; telephone: string; avatar: string; is_rider: boolean; rider: Rider | null; application: Application | null; wallet: number }
/** POST /api/auth/login/code — step 1 of signing in. `code` / `simulated` only when no e-mail could be sent (no SMTP). */
export type LoginCodeResponse = { sent: boolean; to: string; expires_in: number; resend_in: number; code?: string; simulated?: boolean }
/** POST /api/auth/password/link — always answers the same way, whether or not the address has an account. */
export type PasswordLinkResponse = { sent: boolean; to: string }
export type Shelve = {
  id: number; name: string; owner_name: string; country: string; county: string; ward: string; address: string; landmark: string
  contact_phone: string; contact_email: string; opening_time: string; closing_time: string; open_sunday: boolean; sunday_hours: string
  delivery_fee: number; image: string; status: string; is_open: boolean; lat: number | null; lng: number | null
}
export type OrderItem = { id: number; item_id: number; code: string; variant_id: number | null; title: string; variant_label: string; image: string; amount: number; quantity: number; seller_id: number }
export type Delivery = {
  id: number; tracking_no: string; order_id: number; order_no: string; rider: Rider | null; origin: Shelve | null; destination: string; destination_ward: string
  /** `fee` is the trip fee; `rider_earns` what reaches his wallet after UKO keeps its 10 %. */
  distance_km: number; weight_kg: number; fee: number; rider_earns: number; status: string; trade_type?: string; window_start: string; window_end: string; eta: string
  /** A consolidated run: every shelf on the route in visiting order, and the vehicle it was quoted for. */
  stops: number[]; vehicle: string
  /** The shelves he collects from, in visiting order — each marked once it has released its items to him. */
  stop_shelves: StopShelf[]
  /** Set when the run ends at a shelf rather than a buyer — signed for with the shelf's transfer code (the shelf reads it to him), not the buyer's. */
  destination_shelve: Shelve | null; drops_at_shelve: boolean
  /** Issued when the rider accepts: he gives it to the shelf with his national ID and the shelf releases the parcel. */
  collect_code: string
  /** Shelves on the route that have released their items to him so far. */
  handovers: { shelve_id: number; shelve: string; time: string }[]
  offer_expires: string | null; events: { title: string; sub: string; time: string }[]; rider_lat: number | null; rider_lng: number | null; proof: Record<string, any>
  /** The buyer's checkout pin — where the parcel is going. Null when he never dropped one. */
  dest_lat: number | null; dest_lng: number | null
  items: OrderItem[]; buyer: { name: string; phone: string; notes: string } | null; expires_in?: number
  /** Jobs in hand only: the public live-tracking link and when UKO last heard from this phone. */
  tracking?: { url: string; last_seen_at: string | null; warn_minutes: number; missing_minutes: number }
}
/** A seller's item taken to its shelf (shop pickup_jobs) — collected with the seller's 4-digit code, checked in by the shelf.
 *  status offered | accepted | collected | delivered | cancelled · `seller` only once the job is his; the seller's code is never sent. */
/**
 * An item trip between a seller and a shelf, either direction (`kind`).
 *
 *   to_shelf   the hand-off out: collect at the seller against his code, drop at the shelf, which checks it in
 *   to_seller  the item going home (shop PRD 14): collect at the shelf against the host's release code, drop at
 *              the seller's own pin against his — and this app closes the job there, because a doorstep has
 *              nobody to check anything in
 *
 * `collect` and `drop` spell out which is which so a job card never has to work it out from `kind`. `code` on
 * each names the field to send back; neither code is ever in this payload — the person handing the item over
 * reads his out, and that is the whole point of it.
 */
export type PickupStop = { what: 'seller' | 'shelf'; name: string; address: string; lat: number | null; lng: number | null; code: string; note: string }
export type PickupJob = {
  /** Pick-ups in hand only: the public live-tracking link and when UKO last heard from this phone. */
  tracking?: { url: string; last_seen_at: string | null; warn_minutes: number; missing_minutes: number }
  id: number; job_no: string; kind: 'to_shelf' | 'to_seller'; return_id: number | null; title: string
  status: string; fee: number; rider_earns: number; commission_pct: number; vehicle: string; distance_km: number
  pickup_address: string; pickup_lat: number | null; pickup_lng: number | null
  dest_address: string; dest_lat: number | null; dest_lng: number | null
  collect: PickupStop; drop: PickupStop
  item: { id: number; title: string; image: string; weight_kg: number; ward: string } | null
  seller: { name: string; phone: string } | null
  shelf: { id: number; name: string; ward: string; county: string; address: string; contact_phone: string; lat: number | null; lng: number | null } | null
  created_at: string | null; accepted_at: string | null; collected_at: string | null; delivered_at: string | null
}
export type Wallet = {
  role: 'rider'; balance: number; min_withdrawal: number; fee_pct: number; mpesa_number: string
  ledger: { amount: number; reason: string; ref: string; time: string | null }[]
  withdrawals: Withdrawal[]
}
/** debit_payments row · status pending | approved | failed | cancelled · error / error_code (e.g. 2001) when M-PESA refused the payout */
export type Withdrawal = {
  id: number; role?: Wallet['role']; method: 'mpesa' | 'card'; account: string; amount: number; fee: number; net: number; status: string; ref: string; time: string | null
  conversation_id: string; originator_conversation_id: string; receipt: string; error: string; error_code: string; simulated: boolean; socket_key: string
}
export type WithdrawResponse = { withdrawal: Withdrawal; wallet: Wallet; message: string; expires_in: number; socket: { rooms: string[]; key?: string }; relayed?: boolean; note?: string }
export type StopShelf = { id: number; name: string; ward: string; address: string; contact_phone: string; lat: number | null; lng: number | null; handed_over: boolean }

/** GET /api/rider/messages — everyone on his deliveries he can write to */
export type Contact = {
  id: number; name: string; phone?: string; avatar?: string; roles: ('buyer' | 'shelf' | 'seller' | 'contact')[]; jobs: string[]
  unread: number; last: ChatMessage | null
}
export type ChatMessage = { id: number; from: number; to: number; mine: boolean; message: string; is_read: boolean; time: string | null }
/** One delivery (or item pick-up) and the people on it, by side: its buyer, the sellers of its items and the shelves on its route. */
export type MessageJob = {
  key: string; id: number; kind: 'delivery' | 'pickup'; tracking_no: string; status: string; active: boolean; people: number[]
  groups: { buyer: number[]; seller: number[]; shelf: number[] }
}
/** `linked: false` when the rider profile is not linked to a UKO shop account — chat is keyed on shop accounts, so the
 *  inbox is empty and `note` says why. */
export type Threads = { contacts: Contact[]; jobs: MessageJob[]; unread: number; linked?: boolean; note?: string }

/** GET /api/rider/report */
export type Report = {
  days: number
  totals: { jobs: number; delivered: number; in_progress: number; failed: number; earned: number; distance_km: number; drops_all_time: number; rating: number }
  by_day: { date: string; drops: number; earned: number }[]
  proofs: Record<string, number>
  issues: { id: number; ref: string; subject: string; body: string; status: string; time: string | null }[]
}
/** UKO goods cover (GET /api/insurance) */
export type InsuranceCover = { limit: number; excess: number; levy_pct: number; covers: string[]; summary: string }
export type InsuranceClaim = {
  id: number; claim_no: string; party_role: string; ref_type: string; ref_id: number | null; ref_no: string; kind: 'lost' | 'damaged' | 'stolen'
  description: string; items: { title: string; code?: string; value: number }[]; amount_claimed: number; cover_limit: number; excess: number
  payable: number; evidence: string[]; police_station: string; police_ob: string; status: string; amount_approved: number
  payout_role: string; payout_ref: string; decision_note: string; created_at: string | null; decided_at: string | null
}

/** Public live tracking (GET /api/track/{tracking_no}?t=) */
export type PublicTrack = {
  /** A delivery (shelf → buyer) or an item pick-up (seller → shelf). */
  kind?: 'delivery' | 'pickup'; item?: string
  tracking_no: string; status: string; live: boolean; eta: string; window: string; signal: 'ok' | 'lost'
  rider: { name: string; plate: string; vehicle: string } | null
  origin: { lat: number; lng: number; label: string } | null
  destination: { lat: number; lng: number; label: string } | null
  position: { lat: number; lng: number; accuracy: number | null; last_seen_at: string | null; seconds_ago: number | null; maps_url: string; directions_url: string } | null
  trail: [number, number][]
}
