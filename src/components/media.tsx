/** Placeholder map panel, thumbnails and the document upload tile used by the apply form and the rider dashboard. */
import { useRef, useState, type ReactNode } from 'react'
import { FileCheck, ImageIcon, MapPin, Upload, X } from 'lucide-react'
import { api } from '#/lib/api'
import { cx } from './ui'

/** Stylised map placeholder with pins + route (no external tiles needed). */
export function MapPanel({ pins, route, className, height = 260 }: { pins: { label: string; x: number; y: number; tone?: 'primary' | 'secondary' | 'success' }[]; route?: boolean; className?: string; height?: number }) {
  const tones = { primary: 'bg-primary text-white', secondary: 'bg-secondary text-white', success: 'bg-success text-white' }
  return (
    <div className={cx('relative w-full overflow-hidden rounded-md border border-border bg-[#eef2f7]', className)} style={{ height }}>
      <svg className="absolute inset-0 h-full w-full text-border-strong" viewBox="0 0 400 260" preserveAspectRatio="none">
        {[40, 90, 140, 190, 240].map((y) => <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="currentColor" strokeWidth="6" opacity="0.5" />)}
        {[60, 140, 220, 300, 360].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="260" stroke="currentColor" strokeWidth="6" opacity="0.5" />)}
        <rect x="150" y="100" width="70" height="60" fill="#dfe8d8" opacity="0.8" />
        <rect x="290" y="30" width="60" height="40" fill="#d8e3ee" opacity="0.8" />
        {route && pins.length >= 2 && (
          <polyline points={pins.map((p) => `${p.x * 4},${p.y * 2.6}`).join(' ')} fill="none" stroke="#2F44A8" strokeWidth="3" strokeDasharray="6 5" strokeLinecap="round" />
        )}
      </svg>
      {pins.map((p) => (
        <div key={p.label} className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
          <span className={cx('whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold shadow', tones[p.tone || 'primary'])}>{p.label}</span>
          <MapPin size={16} className={p.tone === 'secondary' ? 'text-secondary' : p.tone === 'success' ? 'text-success' : 'text-primary'} />
        </div>
      ))}
    </div>
  )
}

export function Thumb({ src, size = 56, className, children }: { src?: string; size?: number; className?: string; children?: ReactNode }) {
  return (
    <div style={{ width: size, height: size }} className={cx('relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2', className)}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={size * 0.35} className="text-border-strong" />}
      {children}
    </div>
  )
}

/** Single-purpose upload tile (documents / ID photos) — "Driving licence · Upload", shows file state once uploaded. */
export function UploadTile({ label, value, onChange, max = 1, accept = 'image/*,.pdf', className }: { label: string; value: string[]; onChange: (urls: string[]) => void; max?: number; accept?: string; className?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const handle = async (files: FileList | null) => {
    if (!files || !files.length) return
    setErr('')
    setBusy(true)
    const next = [...value]
    try {
      for (const f of Array.from(files)) {
        if (next.length >= max) break
        if (f.size > 25 * 1024 * 1024) { setErr(`${f.name} is larger than 25 MB`); continue }
        const r = await api.upload(f)
        next.push(r.url)
      }
      onChange(next)
    } catch (e: any) {
      setErr(e.message || 'Upload failed')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  const has = value.length > 0
  const state = busy ? 'Uploading…' : has ? (value.length === 1 ? value[0].split('?')[0].split('/').pop()?.slice(-24) || '1 file' : `${value.length} files`) : max > 1 ? `Upload up to ${max}` : 'Upload'
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handle(e.dataTransfer.files) }}
        className={cx('relative flex min-h-[112px] w-full flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-3 py-4 text-center transition-colors', has ? 'border-success/40 bg-success-050 text-success' : 'border-border-strong bg-surface text-ink-2 hover:border-primary-300 hover:text-primary')}
      >
        {has ? <FileCheck size={20} /> : <Upload size={20} />}
        <span className={cx('text-xs font-semibold', has ? 'text-ink' : '')}>{label}</span>
        <span className={cx('max-w-full truncate text-[11px]', has ? 'text-success' : 'text-muted')}>{state}</span>
        {has && !busy && (
          <span role="button" aria-label={`Clear ${label}`} onClick={(e) => { e.stopPropagation(); onChange([]) }} className="absolute right-1.5 top-1.5 rounded-full bg-ink/60 p-1 text-white"><X size={11} /></span>
        )}
      </button>
      {err && <span className="text-[11px] text-danger">{err}</span>}
      <input ref={input} type="file" multiple={max > 1} accept={accept} className="hidden" onChange={(e) => handle(e.target.files)} />
    </div>
  )
}
