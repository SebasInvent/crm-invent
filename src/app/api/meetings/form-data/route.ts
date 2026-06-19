import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET /api/meetings/form-data
 * Contactos + proyectos para el diálogo "Nuevo Evento".
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()
  const [{ data: contacts }, { data: projects }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, first_name, last_name, company_name')
      .eq('status', 'active')
      .order('first_name', { ascending: true })
      .limit(200),
    supabase.from('projects').select('id, name').order('created_at', { ascending: false }).limit(100),
  ])

  return NextResponse.json({ contacts: contacts ?? [], projects: projects ?? [] })
}
