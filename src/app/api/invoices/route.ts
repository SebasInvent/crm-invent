import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireOrg } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * /api/invoices
 *
 * GET  → lista (invoices_view).
 * POST → crea factura + líneas. Número FAC-YYYY-##### vía trigger. Snapshot
 *        del cliente desde el contacto. Patrón requireAuth + service role.
 */

const lineItemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  description: z.string().max(500).default(''),
  quantity: z.coerce.number().min(0).max(1_000_000).default(1),
  unit_price: z.coerce.number().min(0).max(1_000_000_000).default(0),
  discount_percentage: z.coerce.number().min(0).max(100).default(0),
  tax_rate: z.coerce.number().min(0).max(100).default(0),
})

const invoiceCreateSchema = z.object({
  contact_id: z.string().uuid(),
  quote_id: z.string().uuid().optional().nullable(),
  due_date: z.string().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  terms: z.string().max(10000).optional().nullable(),
  currency: z.enum(['COP', 'USD', 'EUR', 'MXN', 'BRL']).optional().default('COP'),
  line_items: z.array(lineItemSchema).min(1).max(100),
})

function computeLine(item: z.infer<typeof lineItemSchema>) {
  const gross = item.quantity * item.unit_price
  const discount_amount = gross * (item.discount_percentage / 100)
  const taxable = gross - discount_amount
  const tax_amount = taxable * (item.tax_rate / 100)
  const line_total = taxable + tax_amount
  return { discount_amount, taxable, tax_amount, line_total }
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('invoices_view')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoices: data ?? [] })
}

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'invoices-create' })
  if (block) return block

  const org = await requireOrg()
  if (org.error) return org.error

  let parsed: z.infer<typeof invoiceCreateSchema>
  try {
    parsed = invoiceCreateSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  const { data: contact } = await supabase
    .from('contacts')
    .select('first_name, last_name, email, company_name')
    .eq('id', parsed.contact_id)
    .single()
  const c = contact as
    | { first_name?: string; last_name?: string; email?: string; company_name?: string }
    | null

  let subtotal = 0
  let tax_amount = 0
  let discount_amount = 0
  const lines = parsed.line_items.map((item, index) => {
    const m = computeLine(item)
    subtotal += m.taxable
    tax_amount += m.tax_amount
    discount_amount += m.discount_amount
    return {
      product_id: item.product_id ?? null,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_percentage: item.discount_percentage,
      tax_rate: item.tax_rate,
      tax_amount: m.tax_amount,
      line_total: m.line_total,
      order_index: index,
    }
  })
  const total_amount = subtotal + tax_amount

  const invoiceInsert = {
    contact_id: parsed.contact_id,
    quote_id: parsed.quote_id ?? null,
    client_name: c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() : null,
    client_email: c?.email ?? null,
    client_company: c?.company_name ?? null,
    subtotal,
    discount_amount,
    tax_amount,
    total_amount,
    amount_paid: 0,
    amount_due: total_amount,
    currency: parsed.currency,
    due_date: parsed.due_date || null,
    notes: parsed.notes ?? null,
    terms: parsed.terms ?? null,
    status: 'draft',
    created_by: org.user.id,
    org_id: org.orgId,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoice, error } = await (supabase.from('invoices') as any)
    .insert(invoiceInsert)
    .select('*')
    .single()

  if (error || !invoice) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })
  }

  const itemsToInsert = lines.map((l) => ({ ...l, invoice_id: invoice.id, org_id: org.orgId }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: itemsError } = await (supabase.from('invoice_line_items') as any).insert(itemsToInsert)
  if (itemsError) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('invoices') as any).delete().eq('id', invoice.id)
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, invoice })
}
