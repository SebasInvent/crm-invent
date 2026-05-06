'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Loader2 } from 'lucide-react'

type ContactRow = { id: string; first_name: string; last_name: string | null; company_name: string | null }
type StageRow = { id: string; name: string; default_probability: number }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * If provided, locks the contact to this id (used when opening from
   * a contact detail page — we already know who the deal is for).
   */
  lockedContactId?: string
  lockedContactLabel?: string
  /**
   * Called after successful creation. Most callers want to refresh
   * server data; the parent should call router.refresh() in here.
   */
  onCreated?: (deal: { id: string; name: string }) => void
}

/**
 * Reusable "+ Nuevo Deal" dialog. Drops onto either:
 *   - a lead/contact detail page (lockedContactId set)
 *   - the pipeline kanban (no lock — full contact picker)
 *
 * Goes through POST /api/deals which validates server-side and writes
 * a `deal_created` activity_log entry automatically.
 */
export function NewDealDialog({
  open,
  onOpenChange,
  lockedContactId,
  lockedContactLabel,
  onCreated,
}: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [stages, setStages] = useState<StageRow[]>([])
  const [loadingMeta, setLoadingMeta] = useState(false)

  const [form, setForm] = useState({
    name: '',
    contact_id: lockedContactId ?? '',
    description: '',
    value: '',
    currency: 'USD' as 'USD' | 'COP' | 'EUR' | 'MXN' | 'BRL',
    stage_id: '',
    expected_close_date: '',
  })

  // Lazy-load contact + stage dropdowns when dialog opens. Awaiting
  // sequentially is fine — these are tiny lookups and avoiding the
  // heterogeneous Promise.all keeps the TS inference simple.
  useEffect(() => {
    if (!open) return
    let active = true
    setLoadingMeta(true)
    ;(async () => {
      try {
        const supabase = getAuthClient()

        const stagesRes = await supabase
          .from('pipeline_stages')
          .select('id, name, default_probability')
          .eq('is_active', true)
          .order('order_index')
        if (active) setStages(((stagesRes.data || []) as unknown) as StageRow[])

        if (!lockedContactId) {
          const contactsRes = await supabase
            .from('contacts')
            .select('id, first_name, last_name, company_name')
            .order('first_name')
            .limit(500)
          if (active) setContacts(((contactsRes.data || []) as unknown) as ContactRow[])
        }
      } finally {
        if (active) setLoadingMeta(false)
      }
    })()
    return () => {
      active = false
    }
  }, [open, lockedContactId])

  // When dialog opens with a locked contact, ensure form has it
  useEffect(() => {
    if (lockedContactId && form.contact_id !== lockedContactId) {
      setForm((f) => ({ ...f, contact_id: lockedContactId }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedContactId])

  async function submit() {
    if (!form.name.trim() || !form.contact_id) {
      toast.error('Nombre y contacto son obligatorios')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          contact_id: form.contact_id,
          description: form.description || null,
          value: form.value ? parseFloat(form.value) : 0,
          currency: form.currency,
          stage_id: form.stage_id || null,
          expected_close_date: form.expected_close_date || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)

      toast.success(`Deal creado: ${form.name}`)
      onOpenChange(false)
      setForm({
        name: '',
        contact_id: lockedContactId ?? '',
        description: '',
        value: '',
        currency: 'USD',
        stage_id: '',
        expected_close_date: '',
      })
      router.refresh()
      if (json.deal && onCreated) onCreated(json.deal)
    } catch (err) {
      toast.error('No se pudo crear el deal', {
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-zinc-950 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle>Nuevo Deal</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {lockedContactLabel
              ? `Para: ${lockedContactLabel}`
              : 'Crea una oportunidad y asóciala a un contacto.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="deal-name">
              Nombre <span className="text-red-400">*</span>
            </Label>
            <Input
              id="deal-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej: Rediseño de marca - Acme"
              autoFocus
              className="bg-zinc-900 border-zinc-800"
            />
          </div>

          {!lockedContactId && (
            <div className="space-y-1.5">
              <Label>
                Contacto <span className="text-red-400">*</span>
              </Label>
              <Select
                value={form.contact_id}
                onValueChange={(v) => setForm({ ...form, contact_id: v })}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectValue
                    placeholder={loadingMeta ? 'Cargando...' : 'Selecciona un contacto'}
                  />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 max-h-72">
                  {contacts.length === 0 && !loadingMeta ? (
                    <div className="px-2 py-1.5 text-xs text-zinc-500">
                      Sin contactos — crea uno primero
                    </div>
                  ) : (
                    contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-white">
                        {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                        {c.company_name ? ` · ${c.company_name}` : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="deal-value">Valor</Label>
              <Input
                id="deal-value"
                type="number"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder="0"
                className="bg-zinc-900 border-zinc-800"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => setForm({ ...form, currency: v as typeof form.currency })}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {['USD', 'COP', 'EUR', 'MXN', 'BRL'].map((c) => (
                    <SelectItem key={c} value={c} className="text-white">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Etapa</Label>
            <Select value={form.stage_id} onValueChange={(v) => setForm({ ...form, stage_id: v })}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                <SelectValue placeholder={loadingMeta ? 'Cargando...' : 'Selecciona etapa'} />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-white">
                    {s.name} · {s.default_probability}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deal-close">Fecha estimada de cierre</Label>
            <Input
              id="deal-close"
              type="date"
              value={form.expected_close_date}
              onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })}
              className="bg-zinc-900 border-zinc-800"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deal-desc">Descripción</Label>
            <textarea
              id="deal-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
              placeholder="Contexto del deal, alcance, próximos pasos…"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="border-zinc-800"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={submitting || !form.name.trim() || !form.contact_id}
            className="bg-white text-black hover:bg-zinc-200"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crear deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
