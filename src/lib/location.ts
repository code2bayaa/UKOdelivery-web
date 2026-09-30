/**
 * The rider's own position, watched while a job is active and reported to the API.
 *
 * `navigator.geolocation.watchPosition` fires as often as the phone feels like — several times a second
 * on a moving boda. Every one of those is a database write and a slice of a rider's data bundle, so the
 * hook posts a fix only when it is both old enough (POST_EVERY_MS) and far enough from the last one it
 * sent (MIN_MOVE_M). Standing at a gate waiting for the buyer costs nothing; riding costs one write every
 * ten seconds. The map still follows every fix locally — the throttle is on the network, not the screen.
 *
 * The position shown on the rider's own map is the browser's, not the one that came back from the API:
 * he should see himself move even when the write fails, which on a Kenyan mobile network it sometimes will.
 */
import { useEffect, useRef, useState } from 'react'
import { api } from './api'

const POST_EVERY_MS = 10_000
const MIN_MOVE_M = 20

export type Fix = { lat: number; lng: number; accuracy: number; at: number }

// ---------------------------------------------------------------- consent, given at sign-in
/**
 * Riders agree to location tracking when they sign in. The agreement is remembered on this device; the browser's own
 * permission is what actually lets us read the position, so both are checked — a rider can still block the site in
 * the browser afterwards, and the dashboard then asks again.
 */
const CONSENT_KEY = 'uko_delivery_location_consent'
export type LocationState = 'granted' | 'prompt' | 'denied' | 'unsupported'

export function hasLocationConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1'
  } catch {
    return false
  }
}

export function setLocationConsent(on: boolean) {
  try {
    if (on) localStorage.setItem(CONSENT_KEY, '1')
    else localStorage.removeItem(CONSENT_KEY)
  } catch {}
}

/** Ask the browser for the position once, which is what brings up its permission prompt. Resolves to the outcome. */
export function requestLocation(): Promise<LocationState> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve('unsupported')
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (e) => resolve(e.code === e.PERMISSION_DENIED ? 'denied' : 'granted'), // a timeout still means we are allowed
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
    )
  })
}

/** The browser's current answer for this site, kept up to date when the rider changes it in site settings. */
export function useLocationPermission(): [LocationState, () => Promise<LocationState>] {
  const [state, setState] = useState<LocationState>(() =>
    typeof navigator !== 'undefined' && navigator.geolocation ? 'prompt' : 'unsupported')

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    let status: PermissionStatus | null = null
    const sync = () => status && setState(status.state as LocationState)
    navigator.permissions?.query({ name: 'geolocation' as PermissionName }).then((s) => {
      status = s
      sync()
      s.addEventListener('change', sync)
    }).catch(() => {})
    return () => status?.removeEventListener('change', sync)
  }, [])

  const ask = async () => {
    const r = await requestLocation()
    setState(r)
    if (r === 'granted') setLocationConsent(true)
    return r
  }
  return [state, ask]
}

/** Metres between two fixes (equirectangular — at these distances it is the same answer as haversine). */
function metresBetween(a: Fix, b: { lat: number; lng: number }): number {
  const R = 6371008.8
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = (((b.lng - a.lng) * Math.PI) / 180) * Math.cos(((a.lat + b.lat) / 2 * Math.PI) / 180)
  return Math.sqrt(dLat * dLat + dLng * dLng) * R
}

/**
 * Watch this device and report it as job `jobId`'s rider position. Pass `null` to stop watching — which
 * is what happens the moment the job is delivered, so a rider is not tracked on his way home.
 *
 * Moving, a fix goes out every POST_EVERY_MS once he has covered MIN_MOVE_M. Standing still he still reports every
 * HEARTBEAT_MS: UKO treats TRACK_WARN_MINUTES of silence as a lost signal and TRACK_MISSING_MINUTES as a missing rider,
 * so a rider waiting at a gate must not look like one who has vanished. The battery level goes along when the browser
 * exposes it — it tells staff whether a phone that went dark simply ran flat.
 */
const HEARTBEAT_MS = 45_000

export function useRiderLocation(jobId: number | null, kind: 'jobs' | 'pickups' = 'jobs'): { fix: Fix | null; error: string; sharing: boolean; lastSent: number | null } {
  const [fix, setFix] = useState<Fix | null>(null)
  const [error, setError] = useState('')
  const [lastSent, setLastSent] = useState<number | null>(null)
  const sent = useRef<{ at: number; lat: number; lng: number } | null>(null)
  const latest = useRef<Fix | null>(null)
  const battery = useRef<number | null>(null)
  const job = useRef(jobId)
  job.current = jobId

  useEffect(() => {
    if (jobId == null) {
      setFix(null)
      setError('')
      sent.current = null
      latest.current = null
      return
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('This device cannot share its location — UKO and the buyer will not see you move')
      return
    }
    let bat: any = null
    const readBattery = () => { if (bat) battery.current = Math.round((bat.level ?? 0) * 100) }
    ;(navigator as any).getBattery?.().then((b: any) => { bat = b; readBattery(); b.addEventListener?.('levelchange', readBattery) }).catch(() => {})

    const post = (f: Fix) => {
      sent.current = { at: Date.now(), lat: f.lat, lng: f.lng }
      // Fire and forget: a dropped fix is replaced by the next one a few seconds later.
      api.post(`/rider/${kind}/${job.current}/location`, { lat: f.lat, lng: f.lng, accuracy: f.accuracy, battery: battery.current ?? undefined })
        .then(() => setLastSent(Date.now())).catch(() => {})
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const next: Fix = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy || 0),
          at: Date.now(),
        }
        latest.current = next
        setFix(next)
        setError('')
        const last = sent.current
        const moved = !last || metresBetween(next, last) >= MIN_MOVE_M
        const due = !last || next.at - last.at >= POST_EVERY_MS
        if ((moved && due) || !last || next.at - last.at >= HEARTBEAT_MS) post(next)
      },
      (e) => setError(e.code === e.PERMISSION_DENIED
        ? 'Location is blocked for this site — turn it on: UKO raises an alarm when a rider with a parcel disappears'
        : 'Could not read your location — move to open sky and keep this page open'),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    )
    // watchPosition goes quiet when the phone does not move; the heartbeat keeps UKO hearing from him.
    const beat = window.setInterval(() => {
      const last = sent.current
      if (last && Date.now() - last.at < HEARTBEAT_MS) return
      navigator.geolocation.getCurrentPosition(
        (pos) => post({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)), accuracy: Math.round(pos.coords.accuracy || 0), at: Date.now() }),
        () => { if (latest.current) post({ ...latest.current, at: Date.now() }) },
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
      )
    }, 15_000)
    return () => { navigator.geolocation.clearWatch(id); window.clearInterval(beat) }
  }, [jobId, kind])

  return { fix, error, sharing: jobId != null && !!fix && !error, lastSent }
}

/**
 * Keep the screen on while a parcel is in hand (Screen Wake Lock API). A phone that locks its screen stops running
 * this page on many Android builds, which stops the location reports. The lock is dropped by the browser whenever the
 * page is hidden, so it is taken again when the rider comes back to it. Returns whether the lock is held.
 */
export function useWakeLock(on: boolean): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const wl = (navigator as any)?.wakeLock
    if (!on || !wl) return setHeld(false)
    let lock: any = null
    let alive = true
    const take = () => wl.request('screen').then((l: any) => {
      if (!alive) return l.release()
      lock = l
      setHeld(true)
      l.addEventListener?.('release', () => setHeld(false))
    }).catch(() => setHeld(false))
    const onVis = () => { if (document.visibilityState === 'visible') take() }
    take()
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch?.(() => {}); setHeld(false) }
  }, [on])
  return held
}
