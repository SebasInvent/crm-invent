import { NextResponse } from 'next/server'
import { requireOrg } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET /api/orgs/members
 * Miembros de la org activa (con email/nombre del profile).
 */
export async function GET() {
  const org = await requireOrg()
  if (org.error) return org.error

  const svc = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc.from('organization_members') as any)
    .select('user_id, role, created_at, profiles(email, full_name)')
    .eq('org_id', org.orgId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const members = ((data as Record<string, any>[] | null) ?? []).map((m) => ({
    user_id: m.user_id,
    role: m.role,
    email: m.profiles?.email ?? null,
    full_name: m.profiles?.full_name ?? null,
    created_at: m.created_at,
  }))
  return NextResponse.json({ members, my_role: org.role })
}
