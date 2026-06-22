import { NextResponse } from 'next/server'
import { requireOrg } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET /api/payments
 * Pagos recientes (con el número de factura) para el panel "Últimos Pagos".
 */
export async function GET() {
  const org = await requireOrg()
  if (org.error) return org.error

  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('payments')
    .select('*, invoices(invoice_number)')
    .eq('org_id', org.orgId)
    .order('payment_date', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const payments = (data as Record<string, any>[] | null)?.map((p) => ({
    ...p,
    invoice_number: p.invoices?.invoice_number ?? null,
  })) ?? []

  return NextResponse.json({ payments })
}
