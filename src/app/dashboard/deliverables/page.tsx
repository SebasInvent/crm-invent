'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { CheckCircle, Clock, Send, FileCheck, Plus, Loader2, Trash2 } from 'lucide-react'

interface Deliverable {
  id: string
  title: string
  description?: string
  agent_id?: string
  agent_name?: string
  approved_for_send?: boolean
  sent_to_client?: boolean
  file_url?: string
  created_at?: string
}
interface AgentOption { id: string; name: string }
interface ProjectOption { id: string; name: string }

export default function DeliverablesPage() {
  const [items, setItems] = useState<Deliverable[]>([])
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [agentId, setAgentId] = useState('')
  const [projectId, setProjectId] = useState('')

  useEffect(() => {
    load()
    fetchFormData()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/deliverables')
      const json = await res.json()
      if (res.ok) setItems((json.deliverables ?? []) as Deliverable[])
      else toast.error(json.error || 'No se pudieron cargar los entregables')
    } catch {
      toast.error('Error de red al cargar entregables')
    } finally {
      setLoading(false)
    }
  }

  async function fetchFormData() {
    try {
      const res = await fetch('/api/deliverables/form-data')
      const json = await res.json()
      if (res.ok) {
        setAgents((json.agents ?? []) as AgentOption[])
        setProjects((json.projects ?? []) as ProjectOption[])
      }
    } catch {
      /* noop */
    }
  }

  async function create() {
    setSaving(true)
    try {
      const res = await fetch('/api/deliverables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || null,
          agent_id: agentId || null,
          project_id: projectId || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se pudo crear')
        return
      }
      toast.success('Entregable creado')
      setOpen(false)
      setTitle('')
      setDescription('')
      setAgentId('')
      setProjectId('')
      load()
    } catch {
      toast.error('Error de red al crear')
    } finally {
      setSaving(false)
    }
  }

  async function patch(id: string, body: Record<string, unknown>, msg: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/deliverables/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se pudo actualizar')
        return
      }
      toast.success(msg)
      load()
    } catch {
      toast.error('Error de red')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar este entregable?')) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/deliverables/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'No se pudo eliminar')
        return
      }
      toast.success('Entregable eliminado')
      load()
    } finally {
      setBusyId(null)
    }
  }

  const assigned = items.filter((d) => !d.approved_for_send && !d.sent_to_client)
  const approved = items.filter((d) => d.approved_for_send && !d.sent_to_client)
  const sent = items.filter((d) => d.sent_to_client)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Pipeline de Entregables</h1>
          <p className="text-zinc-400 mt-1">Gestiona el flujo de trabajo de entregables</p>
        </div>
        <Button className="bg-white text-black hover:bg-zinc-200" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Entregable
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <KpiCard title="Por Aprobar" value={assigned.length} icon={<Clock className="h-4 w-4 text-yellow-400" />} />
        <KpiCard title="Aprobados" value={approved.length} icon={<CheckCircle className="h-4 w-4 text-green-400" />} />
        <KpiCard title="Enviados" value={sent.length} icon={<Send className="h-4 w-4 text-blue-400" />} />
        <KpiCard title="Total" value={items.length} icon={<FileCheck className="h-4 w-4 text-zinc-400" />} />
      </div>

      {loading ? (
        <div className="p-8 text-center text-zinc-500">Cargando...</div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          <Column title="Por Aprobar" icon={<Clock className="h-5 w-5 text-yellow-400" />} list={assigned}
            busyId={busyId} onRemove={remove}
            action={(d) => (
              <Button size="sm" className="w-full bg-green-600 hover:bg-green-500 text-white"
                disabled={busyId === d.id}
                onClick={() => patch(d.id, { approved_for_send: true }, 'Aprobado')}>
                {busyId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aprobar'}
              </Button>
            )} />
          <Column title="Aprobados" icon={<CheckCircle className="h-5 w-5 text-green-400" />} list={approved}
            busyId={busyId} onRemove={remove}
            action={(d) => (
              <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-500 text-white"
                disabled={busyId === d.id}
                onClick={() => patch(d.id, { sent_to_client: true }, 'Marcado como enviado')}>
                {busyId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Marcar enviado'}
              </Button>
            )} />
          <Column title="Enviados" icon={<Send className="h-5 w-5 text-blue-400" />} list={sent}
            busyId={busyId} onRemove={remove} action={() => null} />
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Entregable</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Título *</label>
              <Input className="bg-zinc-900 border-zinc-800 text-white" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Mockups de la landing v2" />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Descripción</label>
              <textarea className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-white text-sm" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Agente</label>
              <select className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-white" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="">Sin asignar</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Proyecto (opcional)</label>
              <select className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-white" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Ninguno</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button className="bg-white text-black hover:bg-zinc-200" onClick={create} disabled={!title.trim() || saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Crear
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KpiCard({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="bg-zinc-950 border-zinc-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-zinc-400">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white">{value}</div>
      </CardContent>
    </Card>
  )
}

function Column({
  title, icon, list, action, onRemove, busyId,
}: {
  title: string
  icon: React.ReactNode
  list: Deliverable[]
  action: (d: Deliverable) => React.ReactNode
  onRemove: (id: string) => void
  busyId: string | null
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
        {icon}
        <h3 className="font-semibold text-white">{title}</h3>
        <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 ml-auto">{list.length}</Badge>
      </div>
      <div className="space-y-3">
        {list.length === 0 && <p className="text-sm text-zinc-600">Vacío</p>}
        {list.map((d) => (
          <Card key={d.id} className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-medium text-white">{d.title}</h4>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-red-400 flex-shrink-0" disabled={busyId === d.id} onClick={() => onRemove(d.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {d.description && <p className="text-sm text-zinc-400">{d.description}</p>}
              <div className="text-xs text-zinc-500">Agente: {d.agent_name || 'No asignado'}</div>
              {action(d)}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
