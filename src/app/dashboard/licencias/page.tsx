'use client'

// Órbita · licencias: create keys, and turn on or off any PC where a key was activated.
// Turning a PC off cuts its signals on its next hand; turning it back on resumes them without typing the key again.
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { KeyRound, Monitor, Plus, Copy, RefreshCw, ShieldAlert } from 'lucide-react'

type Activacion = { id: string; equipo: string; estado: 'activa' | 'desactivada'; creada: number; ultimaVez: number | null; version: string }
type Licencia = {
  id: string; cliente: string; nota: string; maxEquipos: number; vence: number | null
  estado: 'activa' | 'suspendida' | 'revocada'; creada: number; pista: string; bloqueo: string | null; activaciones: Activacion[]
}
type Evento = { en: number; tipo: string; licenciaId: string | null; activacionId: string | null; detalle: string }

const fecha = (t: number | null) => (t ? new Date(t).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')
const dia = (t: number | null) => (t ? new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin vencimiento')
const hace = (t: number | null) => {
  if (!t) return 'nunca'
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'hace un momento' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`
}
const ESTADO_LIC: Record<string, string> = { activa: 'Activa', suspendida: 'Suspendida', revocada: 'Revocada' }
const BLOQUEO: Record<string, string> = { 'licencia-vencida': 'Vencida', 'licencia-suspendida': 'Suspendida', 'licencia-revocada': 'Revocada' }
const EVENTO: Record<string, string> = {
  'licencia-creada': 'Licencia creada', 'licencia-editada': 'Licencia editada', activacion: 'Equipo activado con la clave',
  reactivacion: 'Equipo volvió a escribir la clave', 'sin-cupo': 'Intento sin cupo', 'equipo-desactivado': 'Equipo desactivado desde Control',
  'equipo-activado': 'Equipo reactivado desde Control',
}

async function api(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`)
  return data
}

export default function LicenciasPage() {
  const [licencias, setLicencias] = useState<Licencia[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [nueva, setNueva] = useState({ cliente: '', nota: '', maxEquipos: '1', vence: '' })
  const [claveNueva, setClaveNueva] = useState<{ cliente: string; clave: string } | null>(null)

  const cargar = useCallback(async () => {
    try {
      const d = await api('/api/orbita/licencias')
      setLicencias(d.licencias || []); setEventos(d.eventos || []); setError(null)
    } catch (e) { setError((e as Error).message) } finally { setCargando(false) }
  }, [])
  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t) }, [cargar])

  async function hacer(id: string, fn: () => Promise<unknown>) {
    setOcupado(id)
    try { await fn(); await cargar() } catch (e) { alert((e as Error).message) } finally { setOcupado(null) }
  }
  const equipo = (a: Activacion) => hacer(a.id, () => api(`/api/orbita/activaciones/${a.id}`, 'PATCH', { estado: a.estado === 'activa' ? 'desactivada' : 'activa' }))
  const licencia = (l: Licencia, cambio: Record<string, unknown>, confirmar?: string) => {
    if (confirmar && !confirm(confirmar)) return
    return hacer(l.id, () => api(`/api/orbita/licencias/${l.id}`, 'PATCH', cambio))
  }
  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (!nueva.cliente.trim()) return
    await hacer('nueva', async () => {
      const d = await api('/api/orbita/licencias', 'POST', {
        cliente: nueva.cliente, nota: nueva.nota, maxEquipos: Number(nueva.maxEquipos) || 1,
        vence: nueva.vence ? new Date(nueva.vence + 'T23:59:59').getTime() : null,
      })
      setClaveNueva({ cliente: d.licencia.cliente, clave: d.clave })
      setNueva({ cliente: '', nota: '', maxEquipos: '1', vence: '' })
    })
  }

  const equiposActivos = licencias.reduce((n, l) => n + l.activaciones.filter((a) => a.estado === 'activa').length, 0)
  const nombreLic = (id: string | null) => licencias.find((l) => l.id === id)?.cliente || '—'

  if (!cargando && error && !licencias.length) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-white">Licencias de Órbita</h1>
        <Card className="bg-zinc-950 border-zinc-800"><CardContent className="flex items-center gap-3 p-6 text-zinc-300"><ShieldAlert className="h-5 w-5 text-amber-400" />{error}</CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Licencias de Órbita</h1>
          <p className="text-zinc-400 mt-1">Quién puede usar Órbita y en qué equipos. Desactivar un equipo corta sus señales en la mano siguiente.</p>
        </div>
        <Button onClick={cargar} variant="outline" className="border-zinc-700 text-zinc-200"><RefreshCw className="h-4 w-4 mr-2" />Actualizar</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[['Licencias', licencias.length], ['Licencias vigentes', licencias.filter((l) => !l.bloqueo).length], ['Equipos activos', equiposActivos]].map(([t, v]) => (
          <Card key={t as string} className="bg-zinc-950 border-zinc-800">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-zinc-400">{t}</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-white">{v}</div></CardContent>
          </Card>
        ))}
      </div>

      {claveNueva && (
        <Card className="bg-emerald-950/40 border-emerald-700">
          <CardContent className="space-y-3 p-6">
            <p className="text-emerald-200 font-medium">Clave de {claveNueva.cliente}. Cópiala ahora: no se vuelve a mostrar.</p>
            <div className="flex flex-wrap items-center gap-3">
              <code className="rounded-md bg-black px-3 py-2 font-mono text-lg tracking-wider text-white">{claveNueva.clave}</code>
              <Button onClick={() => navigator.clipboard.writeText(claveNueva.clave)} className="bg-white text-black hover:bg-zinc-200"><Copy className="h-4 w-4 mr-2" />Copiar</Button>
              <Button variant="ghost" className="text-zinc-400" onClick={() => setClaveNueva(null)}>Ya la guardé</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader><CardTitle className="flex items-center gap-2 text-white"><Plus className="h-4 w-4" />Nueva licencia</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={crear} className="grid gap-3 md:grid-cols-[2fr_2fr_1fr_1fr_auto] md:items-end">
            <label className="text-sm text-zinc-400">Cliente<Input required maxLength={80} value={nueva.cliente} onChange={(e) => setNueva({ ...nueva, cliente: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-700 text-white" /></label>
            <label className="text-sm text-zinc-400">Nota<Input maxLength={300} value={nueva.nota} onChange={(e) => setNueva({ ...nueva, nota: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-700 text-white" /></label>
            <label className="text-sm text-zinc-400">Equipos<Input type="number" min={1} max={50} value={nueva.maxEquipos} onChange={(e) => setNueva({ ...nueva, maxEquipos: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-700 text-white" /></label>
            <label className="text-sm text-zinc-400">Vence<Input type="date" value={nueva.vence} onChange={(e) => setNueva({ ...nueva, vence: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-700 text-white" /></label>
            <Button type="submit" disabled={ocupado === 'nueva'} className="bg-white text-black hover:bg-zinc-200"><KeyRound className="h-4 w-4 mr-2" />Crear clave</Button>
          </form>
        </CardContent>
      </Card>

      {cargando && <p className="text-zinc-400">Cargando licencias…</p>}
      {error && licencias.length > 0 && <p className="text-amber-400 text-sm">{error}</p>}

      <div className="space-y-4">
        {licencias.map((l) => (
          <Card key={l.id} className="bg-zinc-950 border-zinc-800">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
              <div>
                <CardTitle className="text-white">{l.cliente} <span className="font-mono text-sm text-zinc-500">{l.pista}</span></CardTitle>
                <p className="mt-1 text-sm text-zinc-400">
                  {l.activaciones.filter((a) => a.estado === 'activa').length} de {l.maxEquipos} equipo{l.maxEquipos === 1 ? '' : 's'} · {dia(l.vence)} · creada {fecha(l.creada)}{l.nota ? ` · ${l.nota}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={l.bloqueo ? 'bg-red-950 text-red-300' : 'bg-emerald-950 text-emerald-300'}>{l.bloqueo ? BLOQUEO[l.bloqueo] || l.bloqueo : ESTADO_LIC[l.estado]}</Badge>
                {l.estado === 'activa' && <Button size="sm" variant="outline" disabled={ocupado === l.id} className="border-zinc-700 text-zinc-200" onClick={() => licencia(l, { estado: 'suspendida' }, `¿Suspender la licencia de ${l.cliente}? Todos sus equipos dejan de leer.`)}>Suspender</Button>}
                {l.estado === 'suspendida' && <Button size="sm" disabled={ocupado === l.id} className="bg-white text-black hover:bg-zinc-200" onClick={() => licencia(l, { estado: 'activa' })}>Reanudar</Button>}
                {l.estado !== 'revocada' && (
                  <Button size="sm" variant="outline" disabled={ocupado === l.id} className="border-zinc-700 text-zinc-200" onClick={() => {
                    const v = prompt('Nueva fecha de vencimiento (AAAA-MM-DD). Déjalo vacío para quitar el vencimiento.', l.vence ? new Date(l.vence).toISOString().slice(0, 10) : '')
                    if (v === null) return
                    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { alert('Usa el formato AAAA-MM-DD.'); return }
                    licencia(l, { vence: v ? new Date(v + 'T23:59:59').getTime() : null })
                  }}>Vencimiento</Button>
                )}
                {l.estado !== 'revocada' && (
                  <Button size="sm" variant="outline" disabled={ocupado === l.id} className="border-zinc-700 text-zinc-200" onClick={() => {
                    const v = prompt('¿Cuántos equipos puede activar esta licencia? (1 a 50)', String(l.maxEquipos))
                    if (v === null) return
                    const n = Number(v)
                    if (!Number.isInteger(n) || n < 1 || n > 50) { alert('Un número de 1 a 50.'); return }
                    licencia(l, { maxEquipos: n })
                  }}>Equipos</Button>
                )}
                {l.estado !== 'revocada' && <Button size="sm" variant="outline" disabled={ocupado === l.id} className="border-red-900 text-red-300" onClick={() => licencia(l, { estado: 'revocada' }, `¿Revocar para siempre la licencia de ${l.cliente}? No se puede deshacer: para volver habría que crear otra.`)}>Revocar</Button>}
              </div>
            </CardHeader>
            <CardContent>
              {l.activaciones.length === 0 ? (
                <p className="text-sm text-zinc-500">Todavía no se ha activado en ningún equipo.</p>
              ) : (
                <ul className="divide-y divide-zinc-800">
                  {l.activaciones.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="flex items-center gap-3">
                        <Monitor className={a.estado === 'activa' ? 'h-4 w-4 text-emerald-400' : 'h-4 w-4 text-zinc-600'} />
                        <div>
                          <p className={a.estado === 'activa' ? 'text-white' : 'text-zinc-500 line-through'}>{a.equipo}</p>
                          <p className="text-xs text-zinc-500">Activado {fecha(a.creada)} · última señal de vida {hace(a.ultimaVez)}{a.version ? ` · v${a.version}` : ''}</p>
                        </div>
                      </div>
                      <Button size="sm" disabled={ocupado === a.id} onClick={() => equipo(a)}
                        className={a.estado === 'activa' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-emerald-600 text-white hover:bg-emerald-500'}>
                        {a.estado === 'activa' ? 'Desactivar' : 'Activar'}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {eventos.length > 0 && (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader><CardTitle className="text-white">Historial</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {eventos.slice(0, 40).map((e, i) => (
                <li key={i} className="flex flex-wrap gap-x-3 text-zinc-400">
                  <span className="w-44 shrink-0 text-zinc-500">{fecha(e.en)}</span>
                  <span className="text-zinc-200">{EVENTO[e.tipo] || e.tipo}</span>
                  <span>{nombreLic(e.licenciaId)}{e.detalle ? ` · ${e.detalle}` : ''}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
