import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * /api/invoices/[id]
 *
 * GET    → factura (invoices_view) + líneas + pagos.
 * PATCH  → estado / fechas / notas (incluye 'void' para anular).
 * DELETE → elimina (líneas y pagos caen por ON DELETE CASCADE).
 */

const invoicePatchSchema = z.object({
  status: z
    .enum(['draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'cancelled', 'refunded', 'void'])
    .optional(),
  due_date: z.string().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  terms: z.string().max(10000).optional().nullable(),
})

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()

  const { data: invoice, error } = await supabase
    .from('invoices_view')
    .select('*')
    .eq('id', params.id)
    .single()
  if (error || !invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: items }, { data: payments }] = await Promise.all([
    supabase.from('invoice_line_items').select('*').eq('invoice_id', params.id).order('order_index', { ascending: true }),
    supabase.from('payments').select('*').eq('invoice_id', params.id).order('payment_date', { ascending: false }),
  ])

  return NextResponse.json({ invoice, items: items ?? [], payments: payments ?? [] })
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  let parsed: z.infer<typeof invoicePatchSchema>
  try {
    parsed = invoicePatchSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('invoices') as any)
    .update(parsed)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, invoice: data })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('invoices') as any).delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
