'use client'

/**
 * Acciones de la ficha de proyecto: "Editar" y "Eliminar" reales
 * (eran botones decorativos en el server component).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Edit, Loader2, Trash2 } from 'lucide-react'

interface Props {
  project: {
    id: string
    name: string | null
    description: string | null
    status: string | null
    progress: number | null
  }
}

const STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled']

export function ProjectDetailActions({ project }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({
    name: project.name ?? '',
    description: project.description ?? '',
    status: project.status ?? 'planning',
    progress: String(project.progress ?? 0),
  })

  async function save() {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return }
    const progress = Math.max(0, Math.min(100, parseInt(form.progress, 10) || 0))
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('projects') as any)
      .update({
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status,
        progress,
      })
      .eq('id', project.id)
    setSaving(false)
    if (error) { toast.error(`No se pudo guardar: ${error.message}`); return }
    toast.success('Proyecto actualizado')
    setOpen(false)
    router.refresh()
  }

  async function remove() {
    if (!window.confirm(`¿Eliminar el proyecto "${project.name}"? Esta acción no se puede deshacer.`)) return
    setDeleting(true)
    const { error } = await supabase.from('projects').delete().eq('id', project.id)
    setDeleting(false)
    if (error) { toast.error(`No se pudo eliminar: ${error.message}`); return }
    toast.success('Proyecto eliminado')
    router.push('/dashboard/projects')
    router.refresh()
  }

  const field = 'bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500'

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => setOpen(true)}>
        <Edit className="h-4 w-4 mr-2" />
        Editar
      </Button>
      <Button variant="destructive" className="bg-red-600 hover:bg-red-700" onClick={remove} disabled={deleting}>
        {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
        Eliminar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Editar proyecto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Nombre *</label>
              <Input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Descripción</label>
              <textarea
                className="w-full rounded-md px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 text-white min-h-[80px]"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Estado</label>
                <select
                  className="w-full h-10 rounded-md px-3 text-sm bg-zinc-900 border border-zinc-700 text-white"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Progreso (%)</label>
                <Input className={field} type="number" min={0} max={100} value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
