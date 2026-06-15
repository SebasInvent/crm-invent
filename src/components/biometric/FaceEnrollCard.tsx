'use client'

import { useEffect, useState } from 'react'
import { ScanFace, ShieldCheck, Loader2, Trash2 } from 'lucide-react'
import { FaceEnrollDialog } from './FaceEnrollDialog'

export function FaceEnrollCard() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [enrolled, setEnrolled] = useState(false)

  async function refresh() {
    try {
      const r = await fetch('/api/biometrics/status')
      const d = await r.json()
      setEnrolled(!!d.enrolled)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function remove() {
    if (!confirm('¿Quitar tu login facial? Podrás volver a registrarlo cuando quieras.')) return
    await fetch('/api/biometrics/enroll', { method: 'DELETE' })
    refresh()
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10">
            <ScanFace className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">Login facial</h3>
            <p className="mt-0.5 max-w-md text-xs text-zinc-500">
              Entra al CRM con tu rostro (InsightFace, con prueba de vida y anti-suplantación). Tu
              contraseña sigue disponible como respaldo.
            </p>
            {!loading && enrolled && (
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" /> Habilitado
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-zinc-600" />
          ) : enrolled ? (
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={() => setOpen(true)}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-900"
              >
                Re-registrar
              </button>
              <button
                onClick={remove}
                className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Quitar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setOpen(true)}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-zinc-100"
            >
              Configurar
            </button>
          )}
        </div>
      </div>

      {open && <FaceEnrollDialog onClose={() => setOpen(false)} onEnrolled={refresh} />}
    </div>
  )
}
