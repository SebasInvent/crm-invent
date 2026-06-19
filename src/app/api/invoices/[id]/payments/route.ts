import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * POST /api/invoices/[id]/payments
 *
 * Registra un pago contra la factura. El trigger update_invoice_on_payment
 * recalcula amount_paid / amount_due / status automáticamente.
 */
const paymentSchema = z.object({
  amount: z.coerce.number().positive().max(1_000_000_000),
  payment_method: z
    .enum(['cash', 'check', 'bank_transfer', 'credit_card', 'debit_card', 'stripe', 'paypal', 'mercadopago', 'wire_transfer', 'other'])
    .default('bank_transfer'),
  payment_date: z.string().optional().nullable(),
  reference_number: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
})

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  let parsed: z.infer<typeof paymentSchema>
  try {
    parsed = paymentSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  const insert = {
    invoice_id: params.id,
    amount: parsed.amount,
    payment_method: parsed.payment_method,
    payment_date: parsed.payment_date || new Date().toISOString().slice(0, 10),
    reference_number: parsed.reference_number ?? null,
    notes: parsed.notes ?? null,
    status: 'completed',
    created_by: auth.user.id,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('payments') as any)
    .insert(insert)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Devolver la factura actualizada (el trigger ya recalculó saldo/estado).
  const { data: invoice } = await supabase
    .from('invoices_view')
    .select('*')
    .eq('id', params.id)
    .single()

  return NextResponse.json({ ok: true, payment: data, invoice })
}
