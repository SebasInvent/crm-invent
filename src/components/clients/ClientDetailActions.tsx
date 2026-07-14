'use client'

/**
 * Acciones de la ficha de cliente. Los botones "Editar" y "Eliminar" del
 * header eran decorativos (sin handler) — esta isla cliente los hace reales.
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
  client: {
    id: string
    name: string | null
    email: string | null
    phone: string | null
    company: string | null
    status: string | null
  }
}

const STATUSES = ['lead', 'active', 'inactive', 'churned']

export function ClientDetailActions({ client }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({
    name: client.name ?? '',
    email: client.email ?? '',
    phone: client.phone ?? '',
    company: client.company ?? '',
    status: client.status ?? 'active',
  })

  async function save() {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return }
    setSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('clients') as any)
      .update({
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        company: form.company.trim() || null,
        status: form.status,
      })
      .eq('id', client.id)
    setSaving(false)
    if (error) { toast.error(`No se pudo guardar: ${error.message}`); return }
    toast.success('Cliente actualizado')
    setOpen(false)
    router.refresh()
  }

  async function remove() {
    if (!window.confirm(`¿Eliminar a "${client.name}"? Esta acción no se puede deshacer.`)) return
    setDeleting(true)
    const { error } = await supabase.from('clients').delete().eq('id', client.id)
    setDeleting(false)
    if (error) { toast.error(`No se pudo eliminar: ${error.message}`); return }
    toast.success('Cliente eliminado')
    router.push('/dashboard/clients')
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
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Nombre *</label>
              <Input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Email</label>
                <Input className={field} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Teléfono</label>
                <Input className={field} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Empresa</label>
                <Input className={field} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
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
