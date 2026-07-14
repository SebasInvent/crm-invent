'use client'

/**
 * Tracker de Publicación — el "check ✓" del CRM.
 * Muestra el estado real de cada pieza producida por Dits (reels, carruseles,
 * stories, posts): publicado / programado / publicando / error, con link a IG.
 * Lee /api/content-calendar (status marcado por el cron pub.js) y auto-refresca.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2, Clock, Loader2, XCircle, RefreshCw,
  Film, LayoutGrid, Circle, Image as ImageIcon, ExternalLink,
} from 'lucide-react'

interface Row {
  id: string
  title: string | null
  scheduled_at: string
  format: string
  asset_urls: string[] | null
  status: string
  published_id: string | null
  error: string | null
  funnel_stage: string | null
}
interface Summary { total: number; published: number; scheduled: number; publishing: number; failed: number; draft: number }

const FORMAT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  reel: Film, carousel: LayoutGrid, story: Circle, image: ImageIcon,
}
const FORMAT_LABEL: Record<string, string> = { reel: 'Reel', carousel: 'Carrusel', story: 'Story', image: 'Post' }

function statusBadge(r: Row) {
  const s = r.status
  if (s === 'published') return { icon: CheckCircle2, cls: 'text-green-400', label: 'Publicado' }
  if (s === 'publishing') return { icon: Loader2, cls: 'text-blue-400 animate-spin', label: 'Publicando' }
  if (s === 'failed' || s === 'error') return { icon: XCircle, cls: 'text-red-400', label: 'Error' }
  if (s === 'draft') return { icon: Circle, cls: 'text-zinc-500', label: 'Borrador' }
  return { icon: Clock, cls: 'text-amber-400', label: 'Programado' }
}

// El published_id guarda el media-id numérico de la Graph API (no un shortcode),
// que no permite deep-link público. Si la pieza está publicada, enlazamos al
// perfil — el ✓ verde es la confirmación; el link es para ir a verlo.
function igLink(r: Row): string | null {
  if (!r.published_id) return null
  return 'https://www.instagram.com/inventagencyco/'
}

export default function PublicacionesPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState<string>('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/content-calendar', { cache: 'no-store' })
      const j = await res.json()
      if (res.ok) {
        setRows(j.rows || [])
        setSummary(j.summary || null)
        setLastSync(new Date().toLocaleTimeString('es-CO'))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 45_000) // auto-refresh cada 45s
    return () => clearInterval(t)
  }, [load])

  // Agrupar por día (America/Bogota)
  const byDay = useMemo(() => {
    const g: Record<string, Row[]> = {}
    for (const r of rows) {
      const d = new Date(r.scheduled_at)
      const key = d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', weekday: 'short', day: '2-digit', month: 'short' })
      ;(g[key] = g[key] || []).push(r)
    }
    return g
  }, [rows])

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })

  const kpis = summary
    ? [
        { label: 'Publicado', value: summary.published, cls: 'text-green-400' },
        { label: 'Programado', value: summary.scheduled, cls: 'text-amber-400' },
        { label: 'Publicando', value: summary.publishing, cls: 'text-blue-400' },
        { label: 'Error', value: summary.failed, cls: 'text-red-400' },
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white">Publicaciones</h1>
          <p className="text-zinc-400 mt-1">
            Estado real de cada pieza de la fábrica Dits — reels, carruseles, stories y posts.
            {lastSync && <span className="text-zinc-600"> · sincronizado {lastSync}</span>}
          </p>
        </div>
        <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" /> Actualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-zinc-950 border-zinc-800">
            <CardContent className="p-4">
              <div className={`text-3xl font-bold ${k.cls}`}>{k.value}</div>
              <div className="text-xs text-zinc-500 mt-1 uppercase tracking-wider">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Cargando calendario…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">No hay piezas programadas en este rango.</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byDay).map(([day, items]) => (
            <div key={day}>
              <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2 capitalize">{day}</div>
              <div className="space-y-2">
                {items.map((r) => {
                  const sb = statusBadge(r)
                  const SB = sb.icon
                  const FI = FORMAT_ICON[r.format] || ImageIcon
                  const link = igLink(r)
                  return (
                    <Card key={r.id} className="bg-zinc-950 border-zinc-800">
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="w-14 shrink-0 text-center">
                          <div className="text-sm font-mono text-zinc-300">{fmtTime(r.scheduled_at)}</div>
                        </div>
                        <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                          <FI className="h-4 w-4 text-zinc-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white truncate">{r.title || '(sin título)'}</div>
                          <div className="text-xs text-zinc-500">
                            {FORMAT_LABEL[r.format] || r.format}
                            {r.asset_urls && r.asset_urls.length > 1 ? ` · ${r.asset_urls.length} slides` : ''}
                            {r.funnel_stage ? ` · ${r.funnel_stage.toUpperCase()}` : ''}
                          </div>
                          {r.error && <div className="text-xs text-red-400 truncate mt-0.5">{r.error}</div>}
                        </div>
                        <div className={`flex items-center gap-1.5 shrink-0 ${sb.cls}`}>
                          <SB className="h-4 w-4" />
                          <span className="text-xs font-medium hidden sm:inline">{sb.label}</span>
                        </div>
                        {link && (
                          <a href={link} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-white shrink-0" title="Ver en Instagram">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
