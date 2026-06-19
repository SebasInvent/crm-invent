import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * POST /api/emails
 *
 * Free-form transactional email via Resend. Used by the composer
 * dialog (Block C) and any place we want to send a one-off email
 * (contact detail "Enviar email" CTA).
 *
 * Behavior:
 *   - Auth required (rate-limit 30/min/IP).
 *   - Zod-validated body. `html` is preferred; if only `text` is
 *     provided we wrap it in a minimal HTML template.
 *   - If client_id or contact_id is given, we log the row in
 *     email_logs (best-effort — log failures don't fail the send).
 *   - sent_by (auth.user.id) is captured for audit.
 *
 * Returns:
 *   { ok: true, id, log_id?: string }
 *
 * If `RESEND_API_KEY` is unset, returns 503 with a helpful message
 * instead of crashing — so the page can render.
 */

const sendSchema = z
  .object({
    to: z.string().email().max(320),
    subject: z.string().min(1).max(300),
    html: z.string().max(200_000).optional(),
    text: z.string().max(50_000).optional(),
    cc: z.string().email().max(320).optional().nullable(),
    reply_to: z.string().email().max(320).optional().nullable(),
    client_id: z.string().uuid().optional().nullable(),
    contact_id: z.string().uuid().optional().nullable(),
  })
  .refine((v) => !!v.html || !!v.text, {
    message: 'Either html or text is required',
  })

function wrapPlainAsHtml(text: string, subject: string): string {
  // Minimal dark-friendly fallback. Email clients largely ignore
  // CSS, so we keep this very simple.
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${subject.replace(
    /[<>&]/g,
    '',
  )}</title></head><body style="font-family:-apple-system,Segoe UI,Inter,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:620px;margin:24px auto;padding:0 16px;">${escaped}</body></html>`
}

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'emails-send' })
  if (block) return block

  const auth = await requireAuth()
  if (auth.error) return auth.error

  let parsed: z.infer<typeof sendSchema>
  try {
    parsed = sendSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'Email service not configured',
        hint: 'Set RESEND_API_KEY in Vercel env vars to enable sending.',
      },
      { status: 503 },
    )
  }

  const resend = new Resend(apiKey)
  const fromAddress = process.env.FROM_EMAIL || 'hola@inventagency.co'
  const html = parsed.html ?? wrapPlainAsHtml(parsed.text!, parsed.subject)

  const sendPayload: Parameters<typeof resend.emails.send>[0] = {
    from: fromAddress,
    to: parsed.to,
    subject: parsed.subject,
    html,
  }
  if (parsed.cc) sendPayload.cc = parsed.cc
  // Older Resend SDK uses snake_case; cast to bypass type narrowing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (parsed.reply_to) (sendPayload as any).reply_to = parsed.reply_to

  const { data, error } = await resend.emails.send(sendPayload)
  if (error) {
    console.error('Resend error:', error)
    return NextResponse.json(
      { error: 'Failed to send email', details: error.message ?? String(error) },
      { status: 502 },
    )
  }

  // Best-effort logging — never fails the send if the DB rejects.
  // Se registra SIEMPRE (no solo cuando hay client_id) para que el historial
  // de la página de Emails refleje también los envíos del composer genérico.
  let logId: string | null = null
  try {
    const supabase = getServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: log } = await (supabase.from('email_logs') as any)
      .insert({
        client_id: parsed.client_id ?? null,
        to_email: parsed.to,
        subject: parsed.subject,
        from_email: fromAddress,
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_by: auth.user.id,
      })
      .select('id')
      .single()
    logId = log?.id ?? null
  } catch (dbError) {
    console.warn('Email log insert failed (send still succeeded):', dbError)
  }

  return NextResponse.json({ ok: true, id: data?.id, log_id: logId })
}
