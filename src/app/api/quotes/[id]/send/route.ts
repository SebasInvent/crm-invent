import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * POST /api/quotes/[id]/send
 *
 * Envía la cotización por email (Resend) con plantilla de marca Invent,
 * marca la cotización como `sent` y registra en email_logs.
 */

let resend: Resend | null = null
function getResendClient(): Resend {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('RESEND_API_KEY is not defined')
    resend = new Resend(apiKey)
  }
  return resend
}

const COP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)

function buildQuoteEmail(quote: Record<string, any>, items: Record<string, any>[]) {
  const rows = items
    .map(
      (it) => `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #222;color:#e4e4e7">${it.description || '—'}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #222;color:#a1a1aa;text-align:center">${Number(it.quantity)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #222;color:#a1a1aa;text-align:right">${COP(Number(it.unit_price))}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #222;color:#fff;text-align:right">${COP(Number(it.line_total))}</td>
        </tr>`,
    )
    .join('')

  return {
    subject: `Cotización ${quote.quote_number} — Invent Agency`,
    html: `
      <!DOCTYPE html><html><head><meta charset="utf-8"/></head>
      <body style="margin:0;background:#09090b;font-family:Inter,-apple-system,sans-serif">
        <div style="max-width:640px;margin:0 auto;padding:40px 24px">
          <img src="https://www.inventagency.co/logo-white.png" alt="Invent Agency" style="height:34px;margin-bottom:28px"/>
          <h1 style="color:#fff;font-size:22px;margin:0 0 6px">Cotización ${quote.quote_number}</h1>
          <p style="color:#a1a1aa;margin:0 0 24px">Para ${quote.client_name || 'estimado cliente'}${quote.client_company ? ` · ${quote.client_company}` : ''}</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px;color:#71717a;font-size:12px;text-transform:uppercase">Concepto</th>
                <th style="text-align:center;padding:8px;color:#71717a;font-size:12px;text-transform:uppercase">Cant.</th>
                <th style="text-align:right;padding:8px;color:#71717a;font-size:12px;text-transform:uppercase">Precio</th>
                <th style="text-align:right;padding:8px;color:#71717a;font-size:12px;text-transform:uppercase">Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div style="border-top:1px solid #333;padding-top:16px;text-align:right">
            <div style="color:#a1a1aa;font-size:14px;margin-bottom:4px">Subtotal: ${COP(Number(quote.subtotal))}</div>
            <div style="color:#a1a1aa;font-size:14px;margin-bottom:4px">Impuestos: ${COP(Number(quote.tax_amount))}</div>
            <div style="color:#fff;font-size:20px;font-weight:600">Total: ${COP(Number(quote.total_amount))}</div>
          </div>
          ${quote.valid_until ? `<p style="color:#71717a;font-size:13px;margin-top:20px">Válida hasta: ${quote.valid_until}</p>` : ''}
          ${quote.notes ? `<p style="color:#a1a1aa;font-size:14px;margin-top:20px;line-height:1.6">${quote.notes}</p>` : ''}
          <div style="margin-top:32px;padding-top:20px;border-top:1px solid #333;color:#71717a;font-size:13px">
            <p>Gracias por confiar en Invent Agency.</p>
          </div>
        </div>
      </body></html>`,
  }
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()

  const { data: quote, error } = await supabase
    .from('quotes_view')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !quote) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const q = quote as Record<string, any>
  const to = q.client_email || q.contact_email
  if (!to) {
    return NextResponse.json(
      { error: 'El cliente no tiene email. Agrega un correo al contacto antes de enviar.' },
      { status: 400 },
    )
  }

  const { data: items } = await supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', params.id)
    .order('order_index', { ascending: true })

  const email = buildQuoteEmail(q, (items as Record<string, any>[]) ?? [])
  const from = process.env.FROM_EMAIL || 'hola@inventagency.co'

  try {
    const { error: sendErr } = await getResendClient().emails.send({
      from,
      to,
      subject: email.subject,
      html: email.html,
    })
    if (sendErr) {
      return NextResponse.json({ error: 'Falló el envío del email' }, { status: 500 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'send failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Marcar como enviada.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('quotes') as any)
    .update({
      status: q.status === 'draft' ? 'sent' : q.status,
      sent_at: new Date().toISOString(),
      sent_count: (Number(q.sent_count) || 0) + 1,
    })
    .eq('id', params.id)

  // Log (best-effort).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('email_logs') as any).insert({
    to_email: to,
    subject: email.subject,
    status: 'sent',
    sent_at: new Date().toISOString(),
    sent_by: auth.user.id,
  })

  return NextResponse.json({ ok: true, sent_to: to })
}
