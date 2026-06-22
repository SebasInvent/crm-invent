import { NextResponse } from 'next/server'
import { requireOrg } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET /api/invoices/form-data
 * Contactos activos + verticales de products para el diálogo "Nueva Factura".
 */
export async function GET() {
  const org = await requireOrg()
  if (org.error) return org.error

  const supabase = getServiceRoleClient()
  const [{ data: contacts }, { data: products }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company_name')
      .eq('status', 'active')
      .eq('org_id', org.orgId)
      .order('first_name', { ascending: true }),
    supabase.from('products').select('id, name').eq('status', 'active').order('name', { ascending: true }),
  ])

  return NextResponse.json({ contacts: contacts ?? [], products: products ?? [] })
}
