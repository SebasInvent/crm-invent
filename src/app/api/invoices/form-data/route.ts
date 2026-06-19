import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET /api/invoices/form-data
 * Contactos activos + verticales de products para el diálogo "Nueva Factura".
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()
  const [{ data: contacts }, { data: products }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company_name')
      .eq('status', 'active')
      .order('first_name', { ascending: true }),
    supabase.from('products').select('id, name').eq('status', 'active').order('name', { ascending: true }),
  ])

  return NextResponse.json({ contacts: contacts ?? [], products: products ?? [] })
}
