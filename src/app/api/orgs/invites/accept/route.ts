import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * POST /api/orgs/invites/accept  { token }
 * Acepta una invitación: agrega al usuario a la org. Valida token/expiración y
 * que el email del invite coincida con el del usuario (en la función SQL).
 */
const schema = z.object({ token: z.string().min(1).max(200) })

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
  const { data, error } = await (svc as any).rpc('accept_org_invite', {
    p_token: parsed.token,
    p_user_id: auth.user.id,
  })

  if (error) {
    const msg = error.message?.includes('invite_invalid_or_expired')
      ? 'La invitación es inválida o expiró.'
      : error.message?.includes('invite_email_mismatch')
        ? 'Esta invitación es para otro email.'
        : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ ok: true, org_id: data })
}
