import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'
import { recordActivity } from '@/lib/activity-log'
import { verifyHubSignature, formatCOP } from '@/lib/payments-hub'

/**
 * POST /api/payments/wompi-callback
 *
 * Callback de liquidación del payments-hub (NO de Wompi directo). Se dispara
 * cuando un pago Wompi de uno de nuestros deals fue aprobado. El hub lo firma
 * con el secreto compartido y reintenta si estamos caídos, así que acá:
 *   - verificamos la firma HMAC (constant-time),
 *   - somos idempotentes por wompi_transaction_id (el hub reintenta),
 *   - revalidamos el monto contra el deal,
 *   - movemos el deal a su etapa "ganada" + registramos el pago.
 *
 * Body del hub: { intent_id, platform_order_id (= deal id), status,
 *   amount_cents, currency, wompi_transaction_id }
 */

export async function POST(request: Request) {
  const raw = await request.text()
  const sig = request.headers.get('x-pitchbull-signature')

  // 1) Firma (constant-time) — 401 si no valida
  if (!verifyHubSignature(raw, sig)) {
    return NextResponse.json({ error: 'firma inválida' }, { status: 401 })
  }

  let payload: {
    intent_id?: string
    platform_order_id?: string | null
    status?: string
    amount_cents?: number
    currency?: string
    wompi_transaction_id?: string
  }
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'json inválido' }, { status: 400 })
  }

  const txId = payload.wompi_transaction_id
  const dealId = payload.platform_order_id ?? null
  if (!txId) return NextResponse.json({ error: 'sin transaction id' }, { status: 400 })

  const supabase = getServiceRoleClient()

  // Estados no-aprobados: ack sin fulfillment
  if (payload.status !== 'approved') {
    return NextResponse.json({ ok: true, note: `status ${payload.status} — sin fulfillment` })
  }

  // 2) Idempotencia: reclamar la liquidación (el hub reintenta). ON CONFLICT DO NOTHING.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: claimed } = await (supabase.from('wompi_settlements') as any)
    .upsert(
      {
        wompi_transaction_id: txId,
        deal_id: dealId,
        intent_id: payload.intent_id ?? null,
        amount_cents: payload.amount_cents ?? null,
        currency: payload.currency ?? 'COP',
        status: 'approved',
      },
      { onConflict: 'wompi_transaction_id', ignoreDuplicates: true },
    )
    .select('wompi_transaction_id')

  const isNew = Array.isArray(claimed) ? claimed.length > 0 : !!claimed
  if (!isNew) {
    return NextResponse.json({ ok: true, note: 'evento ya procesado' })
  }

  if (!dealId) {
    return NextResponse.json({ ok: true, note: 'liquidación sin deal asociado' })
  }

  // 3) Cargar el deal y su pipeline
  const { data: deal } = await supabase
    .from('deals')
    .select('id, name, value, currency, pipeline_id, contact_id, custom_fields')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) {
    return NextResponse.json({ ok: true, note: 'deal no encontrado' })
  }
  const d = deal as {
    id: string
    name: string
    value: number
    pipeline_id: string | null
    contact_id: string | null
    custom_fields: Record<string, unknown> | null
  }

  // 4) Revalidar el monto contra lo que cobramos (defensa en profundidad;
  //    el hub ya validó pago == intent, esto es belt-and-suspenders).
  const expected =
    Number((d.custom_fields as Record<string, unknown> | null)?.checkout_amount_cents) ||
    Math.round((d.value || 0) * 100)
  const amountOk = !expected || Number(payload.amount_cents) === expected

  // 5) Resolver la etapa "ganada" del pipeline del deal (prob = 100)
  let wonStageId: string | null = null
  if (d.pipeline_id) {
    const { data: st } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', d.pipeline_id)
      .eq('is_active', true)
      .eq('default_probability', 100)
      .order('order_index', { ascending: true })
      .limit(1)
    wonStageId = ((Array.isArray(st) ? st[0] : st) as { id: string } | null)?.id ?? null
  }

  // 6) Marcar el deal ganado
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('deals') as any)
    .update({
      status: 'won',
      probability: 100,
      ...(wonStageId ? { stage_id: wonStageId } : {}),
      actual_close_date: new Date().toISOString(),
      won_reason: 'Pago recibido vía Wompi',
      updated_at: new Date().toISOString(),
    })
    .eq('id', d.id)

  // 7) Timeline: el pago aparece en el control (control.inventagency.co)
  recordActivity(supabase, {
    contact_id: d.contact_id ?? undefined,
    deal_id: d.id,
    activity_type: 'deal_won',
    title: `💰 Pago recibido — ${formatCOP(Number(payload.amount_cents) || expected)}`,
    description: amountOk ? null : `⚠️ Monto recibido (${payload.amount_cents}) != esperado (${expected}) — revisar`,
    metadata: {
      source: 'wompi',
      wompi_transaction_id: txId,
      intent_id: payload.intent_id,
      amount_cents: payload.amount_cents,
      amount_ok: amountOk,
    },
  })

  return NextResponse.json({ ok: true, deal_id: d.id, status: 'won' })
}
