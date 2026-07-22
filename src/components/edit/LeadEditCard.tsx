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

type LeadInput = {
  name?: string
  email?: string | null
  phone?: string | null
  company?: string | null
  industry?: string | null
  lead_status?: string
  lead_score?: number
  priority?: string
  jung_archetype?: string | null
  next_follow_up_date?: string | null
}

interface Props {
  leadId: string
  initial: LeadInput
}

/**
 * Inline-editable lead card. Mirror of ContactEditCard but for the
 * lead schema (name single-field, lead_score 0-100, jung_archetype,
 * next_follow_up_date).
 *
 * PATCH goes through the existing /api/leads route which expects
 * `id` in the body (not URL param) — that's the legacy convention
 * from Sprint 1. Could be cleaned up later but works fine.
 */
export function LeadEditCard({ leadId, initial }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<LeadInput>(initial)

  function set<K extends keyof LeadInput>(key: K, value: LeadInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function save() {
    if (!form.name?.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    setSaving(true)
    try {
      const patch: Record<string, unknown> = { id: leadId }
      let dirty = false
      for (const k of Object.keys(form) as (keyof LeadInput)[]) {
        if (form[k] !== initial[k]) {
          patch[k] = form[k]
          dirty = true
        }
      }
      if (!dirty) {
        setEditing(false)
        toast.info('Sin cambios')
        return
      }

      const res = await fetch('/api/leads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)

      toast.success('Lead actualizado')
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
          <CardTitle className="text-sm font-medium text-zinc-400">Editar lead</CardTitle>
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
        <CardTitle className="text-sm font-medium text-white">Editando lead</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label="Nombre *">
          <Input
            value={form.name ?? ''}
            onChange={(e) => set('name', e.target.value)}
            className="bg-zinc-900 border-zinc-800 text-white h-8 text-sm"
            autoFocus
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
            value={form.company ?? ''}
            onChange={(e) => set('company', e.target.value || null)}
            className="bg-zinc-900 border-zinc-800 text-white h-8 text-sm"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Status">
            <Select
              value={form.lead_status ?? 'cold'}
              onValueChange={(v) => set('lead_status', v)}
            >
              <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {[
                  ['hot', 'Hot'],
                  ['warm', 'Warm'],
                  ['cold', 'Cold'],
                  ['qualified', 'Calificado'],
                  ['dead', 'Descartado'],
                  ['converted', 'Cliente'],
                ].map(([value, label]) => (
                  <SelectItem key={value} value={value} className="text-white">
                    {label}
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
                {['critical', 'high', 'medium', 'low'].map((t) => (
                  <SelectItem key={t} value={t} className="text-white">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Score (0-100)">
          <Input
            type="number"
            min={0}
            max={100}
            value={form.lead_score ?? 0}
            onChange={(e) => set('lead_score', parseInt(e.target.value) || 0)}
            className="bg-zinc-900 border-zinc-800 text-white h-8 text-sm"
          />
        </Field>
        <Field label="Arquetipo Jung">
          <Select
            value={form.jung_archetype ?? '__none__'}
            onValueChange={(v) => set('jung_archetype', v === '__none__' ? null : v)}
          >
            <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white h-8 text-sm">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem value="__none__" className="text-zinc-500">— sin definir —</SelectItem>
              <SelectItem value="hero_entrepreneur" className="text-white">🚀 Emprendedor</SelectItem>
              <SelectItem value="sage_conservative" className="text-white">🛡️ Conservador</SelectItem>
              <SelectItem value="caregiver_stressed" className="text-white">💆 Marketing Manager</SelectItem>
              <SelectItem value="artist_specialist" className="text-white">🎨 Especialista</SelectItem>
              <SelectItem value="ruler_executive" className="text-white">👑 Ejecutivo</SelectItem>
              <SelectItem value="explorer_merchant" className="text-white">🛍️ Comerciante</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Próximo follow-up">
          <Input
            type="datetime-local"
            value={
              form.next_follow_up_date
                ? new Date(form.next_follow_up_date).toISOString().slice(0, 16)
                : ''
            }
            onChange={(e) =>
              set(
                'next_follow_up_date',
                e.target.value ? new Date(e.target.value).toISOString() : null,
              )
            }
            className="bg-zinc-900 border-zinc-800 text-white h-8 text-sm"
          />
        </Field>

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
            disabled={saving || !form.name?.trim()}
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
