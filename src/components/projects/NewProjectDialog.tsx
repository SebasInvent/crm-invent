'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { getAuthClient } from '@/lib/supabase-auth'
import { Plus, Loader2 } from 'lucide-react'

type ClientRow = { id: string; name: string }

/**
 * Dialog to create a new project. Loads the available clients list
 * lazily on open, posts to /api/projects, and refreshes the parent
 * server page on success.
 *
 * Replaces the previously-disabled "Nuevo Proyecto" placeholder.
 */
export function NewProjectDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loadingClients, setLoadingClients] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    name: '',
    client_id: '',
    description: '',
    status: 'planning' as 'planning' | 'in_progress' | 'review' | 'completed' | 'cancelled',
    budget: '',
    start_date: '',
    end_date: '',
  })

  // Lazy-load the clients dropdown the first time the dialog opens.
  // Avoids a round-trip on every page load when most users won't open
  // the dialog.
  useEffect(() => {
    if (!open || clients.length > 0) return
    let active = true
    setLoadingClients(true)
    ;(async () => {
      try {
        const supabase = getAuthClient()
        const { data } = await supabase
          .from('clients')
          .select('id, name')
          .order('name')
        if (active && data) setClients(data as ClientRow[])
      } finally {
        if (active) setLoadingClients(false)
      }
    })()
    return () => {
      active = false
    }
  }, [open, clients.length])

  async function submit() {
    if (!form.name.trim() || !form.client_id) {
      toast.error('Nombre y cliente son obligatorios')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          client_id: form.client_id,
          description: form.description || null,
          status: form.status,
          budget: form.budget ? parseFloat(form.budget) : null,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)

      toast.success(`Proyecto creado: ${form.name}`)
      setOpen(false)
      setForm({
        name: '',
        client_id: '',
        description: '',
        status: 'planning',
        budget: '',
        start_date: '',
        end_date: '',
      })
      router.refresh()
    } catch (err) {
      toast.error('No se pudo crear el proyecto', {
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-white text-black hover:bg-zinc-200">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Proyecto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] bg-zinc-950 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle>Nuevo Proyecto</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Crea un proyecto y asígnale un cliente. Podrás añadir entregables y tareas después.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="proj-name">
              Nombre <span className="text-red-400">*</span>
            </Label>
            <Input
              id="proj-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej: Rediseño de marca"
              autoFocus
              className="bg-zinc-900 border-zinc-800"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="proj-client">
              Cliente <span className="text-red-400">*</span>
            </Label>
            <Select
              value={form.client_id}
              onValueChange={(v) => setForm({ ...form, client_id: v })}
            >
              <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                <SelectValue
                  placeholder={loadingClients ? 'Cargando...' : 'Selecciona un cliente'}
                />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {clients.length === 0 && !loadingClients ? (
                  <div className="px-2 py-1.5 text-xs text-zinc-500">
                    Sin clientes — crea uno primero
                  </div>
                ) : (
                  clients.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-white">
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="proj-desc">Descripción</Label>
            <textarea
              id="proj-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
              placeholder="Alcance del proyecto, entregables esperados…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm({ ...form, status: v as typeof form.status })
                }
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="planning" className="text-white">Planning</SelectItem>
                  <SelectItem value="in_progress" className="text-white">In progress</SelectItem>
                  <SelectItem value="review" className="text-white">Review</SelectItem>
                  <SelectItem value="completed" className="text-white">Completed</SelectItem>
                  <SelectItem value="cancelled" className="text-white">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-budget">Presupuesto</Label>
              <Input
                id="proj-budget"
                type="number"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                placeholder="0"
                className="bg-zinc-900 border-zinc-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="proj-start">Fecha inicio</Label>
              <Input
                id="proj-start"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="bg-zinc-900 border-zinc-800"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-end">Fecha fin estimada</Label>
              <Input
                id="proj-end"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="bg-zinc-900 border-zinc-800"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitting}
            className="border-zinc-800"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={submitting || !form.name.trim() || !form.client_id}
            className="bg-white text-black hover:bg-zinc-200"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crear proyecto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
