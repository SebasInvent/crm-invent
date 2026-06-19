import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET /api/payments
 * Pagos recientes (con el número de factura) para el panel "Últimos Pagos".
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('payments')
    .select('*, invoices(invoice_number)')
    .order('payment_date', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const payments = (data as Record<string, any>[] | null)?.map((p) => ({
    ...p,
    invoice_number: p.invoices?.invoice_number ?? null,
  })) ?? []

  return NextResponse.json({ payments })
}
