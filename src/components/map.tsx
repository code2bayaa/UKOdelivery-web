/**
 * Real map tiles (MapLibre GL) for the three places UKO needs to show a position: the shelf, the rider,
 * and the pin the buyer or seller drops.
 *
 * MapLibre renders whatever style URL it is given, so the tile provider is configuration, not code —
 * set VITE_MAP_STYLE to any style.json, or VITE_MAPTILER_KEY and get MapTiler's streets style. With
 * neither set the component falls back to the stylised MapPanel next door: every screen that uses a map
 * keeps working on a fresh clone with no keys in it, and says how to turn the real one on.
 *
 * maplibre-gl is imported dynamically inside the effect. It is ~800 kB and it touches `window` at import
 * time, so a static import would both break SSR and land in the first bundle every visitor downloads.
 */
import { useEffect, useRef, useState } from 'react'
import { ExternalLink, MapPin } from 'lucide-react'
import type { Map as MlMap, Marker as MlMarker } from 'maplibre-gl'
// maplibre-gl 6 parses tiles in a worker it loads from a sibling file, whose URL it works out at runtime
// from `import.meta.url` — a string no bundler can follow. Nothing then emits or serves that file: the dep
// optimizer bundles only the entry, and the build only chunks what it can see. The worker 404s, and a map
// whose worker never starts is silent about it — style, sprite and glyphs load on the main thread, no tile
// is ever requested, no error event fires, and the map sits on "Loading map…" for good. `?worker&url`
// makes Vite bundle the worker and hand back its URL, in dev and in the build alike; setWorkerUrl below
// points maplibre at it. It costs the main bundle a string, not the worker.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { MapPanel } from './media'
import { cx } from './ui'

export type MapTone = 'primary' | 'secondary' | 'success'
export type MapPoint = {
  id: string
  lat?: number | null
  lng?: number | null
  label: string
  tone?: MapTone
  /** The buyer's / seller's own pin: he can drag it instead of clicking the map again. */
  draggable?: boolean
}

const TONES: Record<MapTone, string> = {
  primary: 'var(--color-primary)',
  secondary: 'var(--color-secondary)',
  success: 'var(--color-success)',
}

/**
 * The same three tones as literal colours, for the bits MapLibre paints itself.
 *
 * The pins above are DOM nodes, so CSS resolves `var(--color-primary)` for them and they follow the
 * theme. Paint properties do not go through CSS: MapLibre parses them with its own style spec, which
 * rejects `var(...)` with `color expected, "var(--color-primary)" found` — an error event, which this
 * component treats as a dead map and answers with the sketch panel. So the trip line reads the computed
 * value of the token once, and keeps the stylesheet as the single place the colour is written down.
 */
const TONE_FALLBACK: Record<MapTone, string> = { primary: '#1b2a6b', secondary: '#ff7a45', success: '#17916a' }

function toneColour(tone: MapTone): string {
  if (typeof window === 'undefined') return TONE_FALLBACK[tone]
  const name = TONES[tone].slice(4, -1) // 'var(--color-primary)' -> '--color-primary'
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || TONE_FALLBACK[tone]
}

// Read as static member accesses, never `env[name]`. Vite substitutes the literal text
// `import.meta.env.VITE_FOO` at transform time; a computed lookup is left alone and comes back
// undefined in a production build, which would leave every map stuck on the sketch panel whatever
// the .env said. Keep these spelled out.
const STYLE_URL: string = import.meta.env.VITE_MAP_STYLE || ''
const MAPTILER_KEY: string = import.meta.env.VITE_MAPTILER_KEY || ''

/** The style the map renders, or '' when this deployment has no tiles configured yet. */
export function mapStyleUrl(): string {
  if (STYLE_URL) return STYLE_URL
  return MAPTILER_KEY ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}` : ''
}

export const mapsConfigured = (): boolean => !!mapStyleUrl()

/** Nairobi. Only ever seen for the half second before the first real point arrives. */
const FALLBACK_CENTER: [number, number] = [36.8219, -1.2921]

const placed = (p: MapPoint): p is MapPoint & { lat: number; lng: number } =>
  typeof p.lat === 'number' && typeof p.lng === 'number' && !Number.isNaN(p.lat) && !Number.isNaN(p.lng)

/**
 * MapLibre hands a failed style/tile fetch back as an AJAXError. Its `message` alone reads "Failed to
 * fetch", which sends everyone looking at their own network; the HTTP status is the actual diagnosis —
 * 403 is a key the provider knows but will not serve to this origin, not a key we never set.
 */
function describeError(err: any): string {
  const status = typeof err?.status === 'number' ? err.status : 0
  if (status === 403) return 'the tile provider answered 403 — the key is missing, expired or restricted'
  if (status) return `the tile provider answered ${status}`
  return err?.message || 'the tiles could not be fetched'
}

/** A pin: the coloured teardrop plus its label, built as a DOM node because that is what MapLibre takes. */
function pinElement(p: MapPoint): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'uko-pin'
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;transform:translateY(-6px);cursor:default;'
  const colour = TONES[p.tone || 'primary']
  const label = document.createElement('span')
  label.textContent = p.label
  label.style.cssText =
    `white-space:nowrap;border-radius:999px;padding:3px 9px;font:600 11px/1.3 system-ui,sans-serif;` +
    `color:#fff;background:${colour};box-shadow:0 2px 8px rgba(16,24,40,.28);margin-bottom:2px;`
  const dot = document.createElement('span')
  dot.style.cssText =
    `width:14px;height:14px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);` +
    `background:${colour};border:2px solid #fff;box-shadow:0 1px 4px rgba(16,24,40,.4);`
  el.append(label, dot)
  return el
}

export function MapView({
  points,
  line = false,
  pick = false,
  onPick,
  follow,
  height = 260,
  zoom = 13,
  className,
  hint,
}: {
  points: MapPoint[]
  /** Dashed line through the points in order — the trip, not a road route (see the note under the map). */
  line?: boolean
  /** Clicking the map reports a position: how the buyer and the seller drop their pin. */
  pick?: boolean
  onPick?: (lat: number, lng: number) => void
  /** Id of the point to keep on screen as it moves — the rider. */
  follow?: string
  height?: number
  zoom?: number
  className?: string
  hint?: string
}) {
  const box = useRef<HTMLDivElement | null>(null)
  const map = useRef<MlMap | null>(null)
  const markers = useRef<Record<string, MlMarker>>({})
  const gl = useRef<typeof import('maplibre-gl') | null>(null)
  const pickRef = useRef(onPick)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState('')
  const style = mapStyleUrl()

  pickRef.current = onPick

  // ---- create the map once -------------------------------------------------
  useEffect(() => {
    if (!style || !box.current) return
    let dead = false
    // The map this run owns. Cleanup removes *this* one rather than whatever is in the ref: React
    // mounts effects twice in StrictMode, and the import is async, so the two runs overlap. Guarding on
    // `map.current` instead would let run 1's map survive its own cleanup with `dead` already true —
    // its load handler then returns early, nothing ever sets `ready`, and the map sticks on "Loading".
    let mine: MlMap | null = null
    ;(async () => {
      try {
        const mod = await import('maplibre-gl')
        await import('maplibre-gl/dist/maplibre-gl.css')
        mod.setWorkerUrl(workerUrl)
        if (dead || !box.current) return
        gl.current = mod
        const first = points.find(placed)
        const m = new mod.Map({
          container: box.current,
          style,
          center: first ? [first.lng, first.lat] : FALLBACK_CENTER,
          zoom: first ? zoom : 10,
          attributionControl: { compact: true },
        })
        mine = m
        m.addControl(new mod.NavigationControl({ showCompass: false }), 'top-right')
        m.on('error', (e: any) => setFailed(describeError(e?.error)))
        m.on('load', () => {
          if (dead) return
          m.addSource('uko-trip', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
          m.addLayer({
            id: 'uko-trip',
            type: 'line',
            source: 'uko-trip',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': toneColour('primary'), 'line-width': 3, 'line-dasharray': [2, 2], 'line-opacity': 0.85 },
          })
          setReady(true)
        })
        map.current = m
      } catch (e: any) {
        if (!dead) setFailed(e?.message || 'The map could not be loaded')
      }
    })()
    return () => {
      dead = true
      Object.values(markers.current).forEach((mk) => mk.remove())
      markers.current = {}
      mine?.remove()
      if (map.current === mine) map.current = null
      setReady(false)
    }
    // Rebuild only when the tile style itself changes; points are synced by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style])

  // ---- click to drop a pin -------------------------------------------------
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !pick) return
    const onClick = (e: any) => pickRef.current?.(Number(e.lngLat.lat.toFixed(6)), Number(e.lngLat.lng.toFixed(6)))
    m.on('click', onClick)
    m.getCanvas().style.cursor = 'crosshair'
    return () => {
      m.off('click', onClick)
      if (m.getCanvas()) m.getCanvas().style.cursor = ''
    }
  }, [ready, pick])

  // ---- sync markers + the dashed trip line --------------------------------
  const ids = points.filter(placed).map((p) => p.id).join(',')
  useEffect(() => {
    const m = map.current
    const mod = gl.current
    if (!m || !mod || !ready) return
    const here = points.filter(placed)

    for (const p of here) {
      const existing = markers.current[p.id]
      if (existing) {
        // Move the marker rather than replacing it, so a rider's dot slides instead of blinking.
        existing.setLngLat([p.lng, p.lat])
        const el = existing.getElement().firstElementChild as HTMLElement | null
        if (el && el.textContent !== p.label) el.textContent = p.label
        continue
      }
      const mk = new mod.Marker({ element: pinElement(p), draggable: !!p.draggable, anchor: 'bottom' })
        .setLngLat([p.lng, p.lat])
        .addTo(m)
      if (p.draggable) {
        mk.getElement().style.cursor = 'grab'
        mk.on('dragend', () => {
          const { lat, lng } = mk.getLngLat()
          pickRef.current?.(Number(lat.toFixed(6)), Number(lng.toFixed(6)))
        })
      }
      markers.current[p.id] = mk
    }
    for (const id of Object.keys(markers.current)) {
      if (!here.some((p) => p.id === id)) {
        markers.current[id].remove()
        delete markers.current[id]
      }
    }

    const src: any = m.getSource('uko-trip')
    if (src) {
      src.setData({
        type: 'FeatureCollection',
        features:
          line && here.length >= 2
            ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: here.map((p) => [p.lng, p.lat]) } }]
            : [],
      })
    }
  }, [points, line, ready])

  // ---- frame the points ----------------------------------------------------
  // Only when the *set* of points changes. Refitting on every coordinate update would yank the map out
  // from under someone who has just panned it to look at his street.
  useEffect(() => {
    const m = map.current
    const mod = gl.current
    if (!m || !mod || !ready) return
    const here = points.filter(placed)
    if (here.length === 0) return
    if (here.length === 1) {
      m.easeTo({ center: [here[0].lng, here[0].lat], zoom: Math.max(m.getZoom(), zoom), duration: 600 })
      return
    }
    const b = new mod.LngLatBounds()
    here.forEach((p) => b.extend([p.lng, p.lat]))
    m.fitBounds(b, { padding: 56, maxZoom: 15, duration: 600 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, ready])

  // ---- keep the followed point (the rider) on screen ----------------------
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !follow) return
    const p = points.find((q) => q.id === follow && placed(q))
    if (!p || !placed(p)) return
    // Never cut into the framing animation above: `fitBounds` already puts him in view, and an easeTo fired
    // mid-flight (the bounds are still the old ones) would cancel it and leave the other pins off-screen.
    if (m.isMoving()) return
    if (!m.getBounds().contains([p.lng, p.lat])) m.easeTo({ center: [p.lng, p.lat], duration: 800 })
  }, [points, follow, ready])

  // ---- no tiles configured: the stylised panel, and how to fix it ----------
  if (!style || failed) {
    return <MapFallback points={points} line={line} height={height} className={className} error={failed} />
  }

  return (
    <div className={cx('relative w-full overflow-hidden rounded-md border border-border', className)} style={{ height }}>
      <div ref={box} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-2 text-[11px] text-muted">Loading map…</div>
      )}
      {pick && ready && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2">
          <span className="rounded-full bg-ink/80 px-2.5 py-1 text-[10px] font-semibold text-white">Tap the map, or drag your pin</span>
        </div>
      )}
      {hint && ready && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-2">
          <span className="rounded-full bg-bg/90 px-2.5 py-1 text-[10px] font-semibold text-ink-2 shadow">{hint}</span>
        </div>
      )}
    </div>
  )
}

/**
 * What every map screen shows until someone sets a tile key — the old stylised panel, with the real
 * coordinates projected into it so the pins still sit the right way round relative to each other.
 */
function MapFallback({ points, line, height, className, error }: { points: MapPoint[]; line: boolean; height: number; className?: string; error?: string }) {
  const here = points.filter(placed)
  const lats = here.map((p) => p.lat)
  const lngs = here.map((p) => p.lng)
  const span = (vals: number[]) => Math.max(1e-4, Math.max(...vals) - Math.min(...vals))
  const pins = here.map((p) => ({
    label: p.label,
    x: here.length < 2 ? 50 : 18 + ((p.lng - Math.min(...lngs)) / span(lngs)) * 64,
    y: here.length < 2 ? 55 : 80 - ((p.lat - Math.min(...lats)) / span(lats)) * 52,
    tone: p.tone || ('primary' as MapTone),
  }))
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <MapPanel pins={pins} route={line} height={height} />
      <span className="flex flex-wrap items-center gap-1 text-[10px] text-muted">
        <MapPin size={11} className="shrink-0" />
        {error ? `Map tiles could not load — ${error}. ` : 'Sketch map — real tiles are off. '}
        Point <code className="rounded bg-surface-2 px-1">VITE_MAP_STYLE</code> at a style.json that needs no key, or set a{' '}
        <code className="rounded bg-surface-2 px-1">VITE_MAPTILER_KEY</code> whose allowed origins include this app, in the
        app's <code className="rounded bg-surface-2 px-1">.env</code>.
        <a href="https://cloud.maptiler.com/account/keys/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline">
          MapTiler keys <ExternalLink size={9} />
        </a>
      </span>
    </div>
  )
}
