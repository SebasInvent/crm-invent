import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOrg } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * /api/quotes
 *
 * GET  → lista de cotizaciones (desde quotes_view, con cliente resuelto).
 * POST → crea cotización + líneas. El número (COT-YYYY-####) lo asigna un
 *        trigger en la BD. Snapshot del cliente desde el contacto enlazado.
 *
 * Patrón: requireAuth + getServiceRoleClient (el cliente anon del navegador
 * no lleva sesión, así que toda escritura va por aquí).
 */

const lineItemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  description: z.string().max(500).default(''),
  quantity: z.coerce.number().min(0).max(1_000_000).default(1),
  unit_price: z.coerce.number().min(0).max(1_000_000_000).default(0),
  discount_percentage: z.coerce.number().min(0).max(100).default(0),
  tax_rate: z.coerce.number().min(0).max(100).default(0),
})

const quoteCreateSchema = z.object({
  contact_id: z.string().uuid(),
  valid_until: z.string().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  terms_and_conditions: z.string().max(10000).optional().nullable(),
  currency: z.enum(['COP', 'USD', 'EUR', 'MXN', 'BRL']).optional().default('COP'),
  line_items: z.array(lineItemSchema).min(1).max(100),
})

// Matemática de línea — espejo de calculateTotals() en la página, para que el
// total mostrado al crear coincida con el persistido.
function computeLine(item: z.infer<typeof lineItemSchema>) {
  const gross = item.quantity * item.unit_price
  const discount_amount = gross * (item.discount_percentage / 100)
  const taxable = gross - discount_amount
  const tax_amount = taxable * (item.tax_rate / 100)
  const line_total = taxable + tax_amount
  return { gross, discount_amount, taxable, tax_amount, line_total }
}

export async function GET() {
  const org = await requireOrg()
  if (org.error) return org.error

  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('quotes_view')
    .select('*')
    .eq('org_id', org.orgId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ quotes: data ?? [] })
}

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'quotes-create' })
  if (block) return block

  const org = await requireOrg()
  if (org.error) return org.error

  let parsed: z.infer<typeof quoteCreateSchema>
  try {
    parsed = quoteCreateSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  // Snapshot del cliente desde el contacto.
  const { data: contact } = await supabase
    .from('contacts')
    .select('first_name, last_name, email, company_name')
    .eq('id', parsed.contact_id)
    .single()

  const c = contact as
    | { first_name?: string; last_name?: string; email?: string; company_name?: string }
    | null

  // Totales.
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
      discount_amount: m.discount_amount,
      tax_rate: item.tax_rate,
      tax_amount: m.tax_amount,
      line_total: m.line_total,
      order_index: index,
    }
  })
  const total_amount = subtotal + tax_amount

  const quoteInsert = {
    contact_id: parsed.contact_id,
    client_name: c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() : null,
    client_email: c?.email ?? null,
    client_company: c?.company_name ?? null,
    subtotal,
    discount_amount,
    tax_amount,
    total_amount,
    currency: parsed.currency,
    valid_until: parsed.valid_until || null,
    notes: parsed.notes ?? null,
    terms_and_conditions: parsed.terms_and_conditions ?? null,
    status: 'draft',
    created_by: org.user.id,
    org_id: org.orgId,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: quote, error } = await (supabase.from('quotes') as any)
    .insert(quoteInsert)
    .select('*')
    .single()

  if (error || !quote) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })
  }

  const itemsToInsert = lines.map((l) => ({ ...l, quote_id: quote.id, org_id: org.orgId }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: itemsError } = await (supabase.from('quote_line_items') as any).insert(itemsToInsert)

  if (itemsError) {
    // Rollback manual: borra la cotización huérfana para no dejar basura.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('quotes') as any).delete().eq('id', quote.id)
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, quote })
}
