import { NextResponse } from 'next/server'
import { requireOrg } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * DELETE /api/orgs/invites/[id] → revoca una invitación (owner/admin).
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const org = await requireOrg()
  if (org.error) return org.error
  if (org.role !== 'owner' && org.role !== 'admin') {
    return NextResponse.json({ error: 'Solo owner/admin' }, { status: 403 })
  }

  const svc = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (svc.from('organization_invites') as any)
    .update({ status: 'revoked' })
    .eq('id', params.id)
    .eq('org_id', org.orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
