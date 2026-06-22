import { NextResponse } from 'next/server'
import { requireOrg } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * POST /api/quotes/[id]/duplicate
 *
 * Clona una cotización (cabecera + líneas) como un nuevo borrador. El número
 * lo reasigna el trigger (quote_number queda null → COT-YYYY-#### nuevo).
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const org = await requireOrg()
  if (org.error) return org.error

  const supabase = getServiceRoleClient()

  const { data: original, error: readErr } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', params.id)
    .single()

  if (readErr || !original) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const src = original as Record<string, unknown>
  const clone = {
    contact_id: src.contact_id,
    deal_id: src.deal_id,
    project_id: src.project_id,
    agent_id: src.agent_id,
    client_name: src.client_name,
    client_email: src.client_email,
    client_company: src.client_company,
    client_tax_id: src.client_tax_id,
    subtotal: src.subtotal,
    discount_amount: src.discount_amount,
    discount_percentage: src.discount_percentage,
    tax_amount: src.tax_amount,
    total_amount: src.total_amount,
    currency: src.currency,
    valid_until: src.valid_until,
    notes: src.notes,
    terms_and_conditions: src.terms_and_conditions,
    status: 'draft',
    created_by: org.user.id,
    org_id: org.orgId,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newQuote, error: insErr } = await (supabase.from('quotes') as any)
    .insert(clone)
    .select('*')
    .single()

  if (insErr || !newQuote) {
    return NextResponse.json({ error: insErr?.message ?? 'insert failed' }, { status: 500 })
  }

  const { data: items } = await supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', params.id)

  if (items && items.length > 0) {
    const cloned = (items as Record<string, unknown>[]).map((it) => ({
      quote_id: newQuote.id,
      org_id: org.orgId,
      product_id: it.product_id,
      description: it.description,
      quantity: it.quantity,
      unit_price: it.unit_price,
      discount_percentage: it.discount_percentage,
      discount_amount: it.discount_amount,
      tax_rate: it.tax_rate,
      tax_amount: it.tax_amount,
      line_total: it.line_total,
      order_index: it.order_index,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('quote_line_items') as any).insert(cloned)
  }

  return NextResponse.json({ ok: true, quote: newQuote })
}
