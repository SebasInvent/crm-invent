'use client'

import { useState } from 'react'
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
import { toast } from 'sonner'
import { Loader2, Calendar } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId: string
  /**
   * Existing follow-up (ISO 8601). If set, the input is pre-filled
   * with it so the user can reschedule rather than re-pick from blank.
   */
  current?: string | null
  /**
   * Lead name shown in the dialog body so the user knows what they're
   * scheduling for.
   */
  leadName?: string
}

const QUICK_PRESETS = [
  { label: 'Mañana 10am', offsetMs: 24 * 60 * 60 * 1000, hour: 10 },
  { label: 'Pasado mañana 10am', offsetMs: 2 * 24 * 60 * 60 * 1000, hour: 10 },
  { label: 'En 3 días', offsetMs: 3 * 24 * 60 * 60 * 1000, hour: 10 },
  { label: 'En 1 semana', offsetMs: 7 * 24 * 60 * 60 * 1000, hour: 10 },
] as const

/**
 * Schedule (or reschedule) a follow-up for a lead. Wraps PUT /api/leads
 * with the next_follow_up_date field. Includes quick-presets so the
 * common case ("mañana 10am", "en una semana") doesn't require fiddling
 * with the datetime input.
 */
export function FollowUpDialog({ open, onOpenChange, leadId, current, leadName }: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [value, setValue] = useState(() => isoToLocalInput(current))

  function applyPreset(offsetMs: number, hour: number) {
    const d = new Date(Date.now() + offsetMs)
    d.setHours(hour, 0, 0, 0)
    setValue(toLocalInput(d))
  }

  async function submit(clearInstead = false) {
    setSubmitting(true)
    try {
      const next = clearInstead
        ? null
        : value
          ? new Date(value).toISOString()
          : null
      const res = await fetch('/api/leads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: leadId,
          next_follow_up_date: next,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)

      toast.success(clearInstead ? 'Follow-up eliminado' : 'Follow-up agendado')
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      toast.error('No se pudo agendar', {
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] bg-zinc-950 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Programar follow-up
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {leadName ? `Para: ${leadName}` : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="follow-when">Fecha y hora</Label>
            <Input
              id="follow-when"
              type="datetime-local"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="bg-zinc-900 border-zinc-800"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QUICK_PRESETS.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant="outline"
                onClick={() => applyPreset(p.offsetMs, p.hour)}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-900 h-7 text-xs"
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          {current && (
            <Button
              type="button"
              variant="outline"
              onClick={() => submit(true)}
              disabled={submitting}
              className="border-red-500/40 text-red-400 hover:bg-red-500/10 mr-auto"
            >
              Borrar
            </Button>
          )}
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
            onClick={() => submit(false)}
            disabled={submitting || !value}
            className="bg-white text-black hover:bg-zinc-200"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Convert "2026-05-09T10:00" (datetime-local input) and ISO formats
// back and forth without timezone surprises.
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function isoToLocalInput(iso?: string | null): string {
  if (!iso) return ''
  try {
    return toLocalInput(new Date(iso))
  } catch {
    return ''
  }
}
