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
import { toast } from 'sonner'
import { Send, Loader2, Sparkles } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-fill recipient (from contact detail "Enviar email" button) */
  defaultTo?: string
  /** Pre-fill recipient name for the body greeting */
  defaultRecipientName?: string
  /** Optional client_id so the email is logged in email_logs */
  clientId?: string | null
  /** Optional contact_id (logged in metadata for now) */
  contactId?: string | null
  /** Pre-fill subject (e.g. when sending a follow-up) */
  defaultSubject?: string
  /** Pre-fill body */
  defaultBody?: string
}

const QUICK_TEMPLATES: { label: string; subject: string; body: (name: string) => string }[] = [
  {
    label: 'Follow-up genérico',
    subject: 'Siguiendo nuestra conversación',
    body: (name) =>
      `Hola ${name},\n\nQuería retomar la conversación que tuvimos. ¿Tienes 15 min esta semana para profundizar?\n\nPuedo proponerte algunos horarios o, si prefieres, mándame el que te funciona mejor.\n\nSaludos,\nSebastián`,
  },
  {
    label: 'Reactivación',
    subject: 'Vi tu actividad reciente',
    body: (name) =>
      `Hola ${name},\n\nNoté que volviste a moverte por temas de [tu nicho]. Pensé en escribirte porque hace unos meses comentamos [contexto].\n\n¿Quieres que retomemos?\n\nSaludos,\nSebastián`,
  },
  {
    label: 'Confirmación de demo',
    subject: 'Confirmación: tu demo de Dental OS',
    body: (name) =>
      `Hola ${name},\n\nConfirmo que tu demo está agendado. Te paso las credenciales y un walkthrough corto.\n\nUsuario: \nPassword: \nLink: \n\nCualquier duda me avisas.\n\nSaludos,\nSebastián`,
  },
]

/**
 * Reusable email composer. Drop-in for:
 *   • emails page "Nuevo Email" button
 *   • contact detail "Enviar email" action
 *   • lead detail (future)
 *
 * Posts to POST /api/emails which validates server-side and logs to
 * email_logs when client_id is provided.
 */
export function EmailComposerDialog({
  open,
  onOpenChange,
  defaultTo,
  defaultRecipientName,
  clientId,
  contactId,
  defaultSubject,
  defaultBody,
}: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    to: defaultTo ?? '',
    subject: defaultSubject ?? '',
    body: defaultBody ?? '',
  })

  // Re-sync form when defaults change (e.g. opening dialog from
  // different contacts in sequence)
  useEffect(() => {
    if (open) {
      setForm({
        to: defaultTo ?? '',
        subject: defaultSubject ?? '',
        body: defaultBody ?? '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultTo, defaultSubject, defaultBody])

  function applyTemplate(t: typeof QUICK_TEMPLATES[number]) {
    setForm((f) => ({
      ...f,
      subject: t.subject,
      body: t.body(defaultRecipientName?.split(' ')[0] || 'tú'),
    }))
  }

  async function submit() {
    if (!form.to.trim() || !form.subject.trim() || !form.body.trim()) {
      toast.error('Para, asunto y mensaje son obligatorios')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: form.to.trim(),
          subject: form.subject.trim(),
          text: form.body,
          client_id: clientId || undefined,
          contact_id: contactId || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 503) {
          throw new Error(
            json?.hint ?? 'Email service not configured. Set RESEND_API_KEY in Vercel.',
          )
        }
        throw new Error(json?.error || `HTTP ${res.status}`)
      }

      toast.success('Email enviado')
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      toast.error('No se pudo enviar', {
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-zinc-950 border-zinc-800 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Nuevo email
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Se envía vía Resend desde {process.env.NEXT_PUBLIC_FROM_EMAIL ?? 'hola@inventagency.co'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="email-to">
              Para <span className="text-red-400">*</span>
            </Label>
            <Input
              id="email-to"
              type="email"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
              placeholder="cliente@ejemplo.com"
              className="bg-zinc-900 border-zinc-800"
              disabled={!!defaultTo}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-subject">
              Asunto <span className="text-red-400">*</span>
            </Label>
            <Input
              id="email-subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Asunto"
              className="bg-zinc-900 border-zinc-800"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-body">
              Mensaje <span className="text-red-400">*</span>
            </Label>
            <textarea
              id="email-body"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={9}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700 leading-relaxed"
              placeholder="Hola...&#10;&#10;Te escribo porque..."
            />
            <p className="text-[11px] text-zinc-600">
              Texto plano por ahora — el servidor lo envuelve en HTML básico.
            </p>
          </div>

          {/* Quick templates */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-zinc-600" />
            <span className="text-[10px] uppercase tracking-wider text-zinc-600 mr-1">
              Plantillas:
            </span>
            {QUICK_TEMPLATES.map((t) => (
              <Button
                key={t.label}
                size="sm"
                variant="outline"
                onClick={() => applyTemplate(t)}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-900 h-7 text-xs"
              >
                {t.label}
              </Button>
            ))}
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
            disabled={
              submitting || !form.to.trim() || !form.subject.trim() || !form.body.trim()
            }
            className="bg-white text-black hover:bg-zinc-200"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
