import { NextResponse } from 'next/server'
import { requireOrg } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * DELETE /api/orgs/members/[userId]
 * Quita un miembro de la org activa. Solo owner/admin. No te puedes quitar a ti
 * mismo si eres el único owner.
 */
export async function DELETE(_request: Request, { params }: { params: { userId: string } }) {
  const org = await requireOrg()
  if (org.error) return org.error
  if (org.role !== 'owner' && org.role !== 'admin') {
    return NextResponse.json({ error: 'Solo owner/admin pueden quitar miembros' }, { status: 403 })
  }

  const svc = getServiceRoleClient()
  // No permitir quitar al owner de la org.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: target } = await (svc.from('organization_members') as any)
    .select('role')
    .eq('org_id', org.orgId)
    .eq('user_id', params.userId)
    .maybeSingle()
  if (target?.role === 'owner') {
    return NextResponse.json({ error: 'No se puede quitar al owner' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (svc.from('organization_members') as any)
    .delete()
    .eq('org_id', org.orgId)
    .eq('user_id', params.userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
