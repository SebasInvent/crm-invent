'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Pencil, X, Check, Loader2 } from 'lucide-react'

type ContactInput = {
  first_name?: string
  last_name?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  job_title?: string | null
  company_name?: string | null
  industry?: string | null
  type?: string
  status?: string
  priority?: string
  city?: string | null
  country?: string | null
  website?: string | null
  linkedin_url?: string | null
}

interface Props {
  contactId: string
  initial: ContactInput
}

/**
 * Inline-editable contact card. Click "Editar" to flip the read-only
 * sidebar into an edit form; submit goes to PATCH /api/contacts/[id]
 * which validates server-side. On success we router.refresh() so the
 * server-rendered detail page picks up new values.
 *
 * Designed to live inside the existing /dashboard/contacts/[id]
 * sidebar — same look as the static info card but interactive.
 */
export function ContactEditCard({ contactId, initial }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ContactInput>(initial)

  function set<K extends keyof ContactInput>(key: K, value: ContactInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function save() {
    if (!form.first_name?.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    setSaving(true)
    try {
      // Build a diff of what actually changed so the PATCH stays small
      const patch: Record<string, unknown> = {}
      for (const k of Object.keys(form) as (keyof ContactInput)[]) {
        if (form[k] !== initial[k]) patch[k] = form[k]
      }
      if (Object.keys(patch).length === 0) {
        setEditing(false)
        toast.info('Sin cambios')
        return
      }

      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)

      toast.success('Contacto actualizado')
      setEditing(false)
      router.refresh()
    } catch (err) {
      toast.error('No se pudo guardar', {
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
      })
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setForm(initial)
    setEditing(false)
  }

  if (!editing) {
    return (
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium text-zinc-400">Editar info</CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            className="h-7 text-zinc-300 hover:text-white"
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Editar
          </Button>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="bg-zinc-950 border-zinc-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-white">Editando contacto</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label="Nombre *">
          <Input
            value={form.first_name ?? ''}
            onChange={(e) => set('first_name', e.target.value)}
            className="bg-zinc-900 border-zinc-800 text-white h-8 text-sm"
            autoFocus
          />
        </Field>
        <Field label="Apellido">
          <Input
            value={form.last_name ?? ''}
            onChange={(e) => set('last_name', e.target.value || null)}
            className="bg-zinc-900 border-zinc-800 text-white h-8 text-sm"
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email ?? ''}
            onChange={(e) => set('email', e.target.value || null)}
            className="bg-zinc-900 border-zinc-800 text-white h-8 text-sm"
          />
        </Field>
        <Field label="Teléfono">
          <Input
            value={form.phone ?? ''}
            onChange={(e) => set('phone', e.target.value || null)}
            className="bg-zinc-900 border-zinc-800 text-white h-8 text-sm"
          />
        </Field>
        <Field label="Empresa">
          <Input
            value={form.company_name ?? ''}
            onChange={(e) => set('company_name', e.target.value || null)}
            className="bg-zinc-900 border-zinc-800 text-white h-8 text-sm"
          />
        </Field>
        <Field label="Cargo">
          <Input
            value={form.job_title ?? ''}
            onChange={(e) => set('job_title', e.target.value || null)}
            className="bg-zinc-900 border-zinc-800 text-white h-8 text-sm"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tipo">
            <Select
              value={form.type ?? 'lead'}
              onValueChange={(v) => set('type', v)}
            >
              <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {['lead', 'prospect', 'customer', 'partner', 'supplier'].map((t) => (
                  <SelectItem key={t} value={t} className="text-white">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Prioridad">
            <Select
              value={form.priority ?? 'medium'}
              onValueChange={(v) => set('priority', v)}
            >
              <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {['low', 'medium', 'high', 'critical'].map((t) => (
                  <SelectItem key={t} value={t} className="text-white">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={cancel}
            disabled={saving}
            className="h-8 border-zinc-700 text-zinc-400"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={saving || !form.first_name?.trim()}
            className="h-8 bg-white text-black hover:bg-zinc-200"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5 mr-1" />
            )}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</Label>
      {children}
    </div>
  )
}
