import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAriaAuth, logAriaAction } from '@/lib/aria-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'
import { recordActivity } from '@/lib/activity-log'
import { createHubCheckout, formatCOP } from '@/lib/payments-hub'

/**
 * POST /api/aria/actions/deals/checkout
 *
 * Genera el link de pago Wompi personalizado para un deal listo para comprar
 * — el último tramo del flujo agente → pipeline → Wompi.
 *
 * invent-crm no toca Wompi: le pide el checkout al payments-hub. El link +
 * la referencia quedan guardados en el deal y se devuelven para que el agente
 * se los mande al lead. Cuando paga, el hub llama a
 * /api/payments/wompi-callback y ahí el deal se marca ganado.
 */

const bodySchema = z.object({
  deal_id: z.string().uuid(),
  redirect_url: z.string().url().max(500).optional(),
  // override opcional del monto (en PESOS); por defecto usa deal.value
  amount: z.coerce.number().min(1000).max(1_000_000_000).optional(),
})

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 20, key: 'aria-deal-checkout' })
  if (block) return block

  const auth = requireAriaAuth(request)
  if (auth.error) return auth.error

  let b: z.infer<typeof bodySchema>
  try {
    b = bodySchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  try {
    const { data: deal } = await supabase
      .from('deals')
      .select('id, name, value, currency, contact_id, custom_fields')
      .eq('id', b.deal_id)
      .maybeSingle()

    if (!deal) return NextResponse.json({ error: 'Deal no encontrado' }, { status: 404 })

    const d = deal as {
      id: string
      name: string
      value: number
      currency: string | null
      contact_id: string | null
      custom_fields: Record<string, unknown> | null
    }

    const pesos = b.amount ?? d.value
    if (!pesos || pesos <= 0) {
      return NextResponse.json(
        { error: 'El deal no tiene un value para cobrar; pasá `amount` (en pesos) o seteá el value del deal' },
        { status: 409 },
      )
    }

    // COP → centavos, entero
    const amountCents = Math.round(pesos * 100)

    const checkout = await createHubCheckout({
      amountCents,
      currency: d.currency || 'COP',
      orderId: d.id,
      redirectUrl: b.redirect_url,
      metadata: { deal_id: d.id, contact_id: d.contact_id, deal_name: d.name },
    })

    // Guardar el link + la referencia en el deal
    const custom = {
      ...(d.custom_fields ?? {}),
      checkout_url: checkout.checkout_url,
      checkout_reference: checkout.reference,
      checkout_intent_id: checkout.intent_id,
      checkout_amount_cents: amountCents,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('deals') as any)
      .update({ custom_fields: custom, updated_at: new Date().toISOString() })
      .eq('id', d.id)

    recordActivity(supabase, {
      contact_id: d.contact_id ?? undefined,
      deal_id: d.id,
      activity_type: 'proposal_sent',
      title: `Link de pago Wompi generado — ${formatCOP(amountCents)}`,
      description: null,
      metadata: {
        source: 'aria',
        reference: checkout.reference,
        amount_cents: amountCents,
        checkout_url: checkout.checkout_url,
      },
    })

    logAriaAction('deals.checkout', { deal_id: d.id, amount_cents: amountCents }, 'ok')
    return NextResponse.json({
      ok: true,
      checkout_url: checkout.checkout_url,
      reference: checkout.reference,
      amount_cents: amountCents,
      message: `Link de pago por ${formatCOP(amountCents)}: ${checkout.checkout_url}`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    logAriaAction('deals.checkout', { deal_id: b.deal_id }, 'error', msg)
    return NextResponse.json({ error: 'Checkout failed', details: msg }, { status: 500 })
  }
}
