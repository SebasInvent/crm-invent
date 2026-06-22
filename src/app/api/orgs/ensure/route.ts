import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * POST /api/orgs/ensure
 * Garantiza que el usuario autenticado tenga workspace + profile. Lo llama el
 * OrgProvider en el primer load (cubre login por email/contraseña o facial, que
 * no pasan por el callback de OAuth). Idempotente vía la función ensure_profile.
 */
export async function POST() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const svc = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc as any).rpc('ensure_profile', {
    p_user_id: auth.user.id,
    p_email: auth.user.email,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, org_id: data })
}
