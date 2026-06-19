import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET /api/deliverables/form-data
 * Agentes + proyectos + contactos para el diálogo "Nuevo Entregable".
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()
  const [{ data: agents }, { data: projects }, { data: contacts }] = await Promise.all([
    supabase.from('agents').select('id, name').order('name', { ascending: true }),
    supabase.from('projects').select('id, name').order('created_at', { ascending: false }).limit(100),
    supabase
      .from('contacts')
      .select('id, first_name, last_name, company_name')
      .eq('status', 'active')
      .order('first_name', { ascending: true })
      .limit(200),
  ])

  return NextResponse.json({ agents: agents ?? [], projects: projects ?? [], contacts: contacts ?? [] })
}
