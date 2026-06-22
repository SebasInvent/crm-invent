import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * POST /api/orgs/switch  { org_id }
 * Cambia la org activa del usuario (valida que sea miembro).
 */
const schema = z.object({ org_id: z.string().uuid() })

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  let parsed: z.infer<typeof schema>
  try {
    parsed = schema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const svc = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: mem } = await (svc.from('organization_members') as any)
    .select('org_id')
    .eq('user_id', auth.user.id)
    .eq('org_id', parsed.org_id)
    .maybeSingle()

  if (!mem) return NextResponse.json({ error: 'No eres miembro de esa organización' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (svc.from('profiles') as any).update({ active_org_id: parsed.org_id }).eq('id', auth.user.id)
  return NextResponse.json({ ok: true, active_org_id: parsed.org_id })
}
