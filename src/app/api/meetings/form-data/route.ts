import { NextResponse } from 'next/server'
import { requireOrg } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET /api/meetings/form-data
 * Contactos + proyectos para el diálogo "Nuevo Evento".
 */
export async function GET() {
  const org = await requireOrg()
  if (org.error) return org.error

  const supabase = getServiceRoleClient()
  const [{ data: contacts }, { data: projects }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, first_name, last_name, company_name')
      .eq('status', 'active')
      .eq('org_id', org.orgId)
      .order('first_name', { ascending: true })
      .limit(200),
    supabase.from('projects').select('id, name').eq('org_id', org.orgId).order('created_at', { ascending: false }).limit(100),
  ])

  return NextResponse.json({ contacts: contacts ?? [], projects: projects ?? [] })
}
