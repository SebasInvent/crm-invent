'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Calendar, Clock, Plus, Loader2, Trash2, CheckCircle, Video, ChevronRight } from 'lucide-react'
import { format, isToday, isTomorrow, isPast } from 'date-fns'
import { es } from 'date-fns/locale'

interface EventItem {
  id: string
  title: string
  description?: string
  scheduled_at: string
  status?: string
  meeting_link?: string
  contact_name?: string
  contact_company?: string
}
interface FollowUp {
  id: string
  name: string
  company: string | null
  lead_status: string
  next_follow_up_date: string
}
interface ContactOption { id: string; first_name: string; last_name?: string; company_name?: string }

type Bucket = 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'later'
function bucketOf(iso: string): Bucket {
  const d = new Date(iso)
  if (isPast(d) && !isToday(d)) return 'overdue'
  if (isToday(d)) return 'today'
  if (isTomorrow(d)) return 'tomorrow'
  const days = (d.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  if (days < 7) return 'this_week'
  return 'later'
}
const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: 'Vencidos', today: 'Hoy', tomorrow: 'Mañana', this_week: 'Esta semana', later: 'Más adelante',
}
const BUCKET_ACCENT: Record<Bucket, string> = {
  overdue: 'text-red-400', today: 'text-emerald-400', tomorrow: 'text-sky-400', this_week: 'text-amber-400', later: 'text-zinc-400',
}

export default function CalendarPage() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState('')
  const [description, setDescription] = useState('')
  const [link, setLink] = useState('')
  const [contactId, setContactId] = useState('')

  useEffect(() => {
    load()
    fetchFormData()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/meetings')
      const json = await res.json()
      if (res.ok) {
        setEvents((json.meetings ?? []) as EventItem[])
        setFollowUps((json.followUps ?? []) as FollowUp[])
      } else toast.error(json.error || 'No se pudo cargar el calendario')
    } catch {
      toast.error('Error de red al cargar el calendario')
    } finally {
      setLoading(false)
    }
  }

  async function fetchFormData() {
    try {
      const res = await fetch('/api/meetings/form-data')
      const json = await res.json()
      if (res.ok) setContacts((json.contacts ?? []) as ContactOption[])
    } catch { /* noop */ }
  }

  async function create() {
    if (!title.trim() || !when) {
      toast.error('Título y fecha son obligatorios')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || null,
          scheduled_at: new Date(when).toISOString(),
          meeting_link: link || null,
          contact_id: contactId || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'No se pudo crear el evento'); return }
      toast.success('Evento creado')
      setOpen(false); setTitle(''); setWhen(''); setDescription(''); setLink(''); setContactId('')
      load()
    } catch {
      toast.error('Error de red al crear el evento')
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(id: string, status: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      if (!res.ok) { const j = await res.json(); toast.error(j.error || 'No se pudo actualizar'); return }
      toast.success('Evento actualizado'); load()
    } finally { setBusyId(null) }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar este evento?')) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json(); toast.error(j.error || 'No se pudo eliminar'); return }
      toast.success('Evento eliminado'); load()
    } finally { setBusyId(null) }
  }

  // Merge events + follow-ups into urgency buckets
  const buckets: Record<Bucket, { events: EventItem[]; followUps: FollowUp[] }> = {
    overdue: { events: [], followUps: [] }, today: { events: [], followUps: [] },
    tomorrow: { events: [], followUps: [] }, this_week: { events: [], followUps: [] }, later: { events: [], followUps: [] },
  }
  for (const e of events) {
    if (e.status === 'completed' || e.status === 'cancelled') continue
    buckets[bucketOf(e.scheduled_at)].events.push(e)
  }
  for (const f of followUps) buckets[bucketOf(f.next_follow_up_date)].followUps.push(f)

  const orderedBuckets = (Object.keys(buckets) as Bucket[]).filter(
    (b) => buckets[b].events.length > 0 || buckets[b].followUps.length > 0,
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Calendario</h1>
          <p className="text-zinc-400 mt-1">Eventos y follow-ups del CRM, agrupados por urgencia.</p>
        </div>
        <Button className="bg-white text-black hover:bg-zinc-200" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Evento
        </Button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-zinc-500">Cargando...</div>
      ) : orderedBuckets.length === 0 ? (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-10 text-center">
            <Calendar className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">Sin eventos ni follow-ups</p>
            <p className="text-zinc-600 text-sm mt-1">Crea un evento con &quot;Nuevo Evento&quot;.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {orderedBuckets.map((bucket) => (
            <Card key={bucket} className="bg-zinc-950 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-medium flex items-center justify-between ${BUCKET_ACCENT[bucket]}`}>
                  <span className="flex items-center gap-2 uppercase tracking-wider text-xs">
                    <Clock className="h-3.5 w-3.5" />
                    {BUCKET_LABELS[bucket]}
                  </span>
                  <span className="text-xs font-normal text-zinc-500">
                    {buckets[bucket].events.length + buckets[bucket].followUps.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ol className="divide-y divide-zinc-800">
                  {buckets[bucket].events.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-zinc-900/40">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white truncate">{e.title}</span>
                          <Badge variant="outline" className="border-cyan-500/40 text-cyan-400 text-[10px]">Evento</Badge>
                          {e.meeting_link && (
                            <a href={e.meeting_link} target="_blank" rel="noreferrer" className="text-cyan-400 inline-flex items-center gap-1 text-[11px]">
                              <Video className="h-3 w-3" /> link
                            </a>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5 truncate">
                          {e.contact_name || e.contact_company || e.description || '—'}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-zinc-300">{format(new Date(e.scheduled_at), "EEE d MMM", { locale: es })}</div>
                        <div className="text-[11px] font-mono text-zinc-500">{format(new Date(e.scheduled_at), 'HH:mm')}</div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-green-400" disabled={busyId === e.id} title="Completar" onClick={() => setStatus(e.id, 'completed')}>
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-red-400" disabled={busyId === e.id} title="Eliminar" onClick={() => remove(e.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                  {buckets[bucket].followUps.map((f) => (
                    <li key={f.id}>
                      <Link href={`/dashboard/leads/${f.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-zinc-900/50">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-white truncate">{f.name}</span>
                            <Badge variant="outline" className="border-zinc-600 text-zinc-400 text-[10px]">Follow-up</Badge>
                          </div>
                          <div className="text-xs text-zinc-500 mt-0.5 truncate">{f.company || '—'}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs text-zinc-300">{format(new Date(f.next_follow_up_date), "EEE d MMM", { locale: es })}</div>
                          <div className="text-[11px] font-mono text-zinc-500">{format(new Date(f.next_follow_up_date), 'HH:mm')}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-zinc-700 flex-shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Evento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Título *</label>
              <Input className="bg-zinc-900 border-zinc-800 text-white" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Demo con Credicorp" />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Fecha y hora *</label>
              <Input type="datetime-local" className="bg-zinc-900 border-zinc-800 text-white" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Contacto (opcional)</label>
              <select className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-white" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">Ninguno</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}{c.company_name ? ` — ${c.company_name}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Link de reunión (opcional)</label>
              <Input className="bg-zinc-900 border-zinc-800 text-white" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.google.com/..." />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Descripción</label>
              <textarea className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-white text-sm" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button className="bg-white text-black hover:bg-zinc-200" onClick={create} disabled={!title.trim() || !when || saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Crear Evento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
