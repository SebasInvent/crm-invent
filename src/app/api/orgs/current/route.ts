import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET /api/orgs/current
 * Devuelve la org activa del usuario + todas las orgs a las que pertenece.
 * Lo consume el OrgProvider / selector de workspace.
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const svc = getServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: mem } = await (svc.from('organization_members') as any)
    .select('org_id, role, organizations(id, name, slug)')
    .eq('user_id', auth.user.id)

  const orgs = ((mem as Record<string, any>[] | null) ?? []).map((m) => ({
    id: m.org_id,
    role: m.role,
    name: m.organizations?.name ?? null,
    slug: m.organizations?.slug ?? null,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prof } = await (svc.from('profiles') as any)
    .select('active_org_id, full_name')
    .eq('id', auth.user.id)
    .single()

  let active = (prof as { active_org_id?: string } | null)?.active_org_id ?? null
  if (!active || !orgs.find((o) => o.id === active)) active = orgs[0]?.id ?? null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: connections } = active
    ? await (svc.from('organization_connections') as any)
        .select('connected_org_id, relationship, share_contacts, share_commercial_data')
        .eq('org_id', active)
        .eq('status', 'active')
    : { data: [] }

  return NextResponse.json({
    active_org_id: active,
    orgs,
    connections: connections ?? [],
    connected_org_ids: ((connections as Array<{ connected_org_id: string }> | null) ?? [])
      .map((connection) => connection.connected_org_id),
  })
}
