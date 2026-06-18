import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET /api/quotes/form-data
 *
 * Datos para el diálogo "Nueva Cotización": contactos activos (para elegir
 * cliente) y los verticales de products activos (como chips de "agregar línea
 * rápida"). Va por service role para evitar depender de RLS en el cliente anon.
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
    supabase
      .from('products')
      .select('id, name')
      .eq('status', 'active')
      .order('name', { ascending: true }),
  ])

  return NextResponse.json({
    contacts: contacts ?? [],
    products: products ?? [],
  })
}
