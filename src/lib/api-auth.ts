/**
 * API auth helpers for route handlers.
 *
 * Usage in any /api/.../route.ts:
 *
 *   import { requireAuth } from '@/lib/api-auth'
 *
 *   export async function POST(request: Request) {
 *     const auth = await requireAuth()
 *     if (auth.error) return auth.error  // 401 response
 *
 *     // auth.session.user is the authenticated user
 *     // ...your logic
 *   }
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Session, User } from '@supabase/supabase-js'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * Get the current Supabase session from cookies on the server.
 * Returns null if no session or invalid token.
 */
export async function getApiSession(): Promise<Session | null> {
  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        // We don't need to set/remove cookies in API handlers (the middleware
        // already refreshed them), so these are intentional no-ops.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
        set(_name: string, _value: string, _options: any) {},
        // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
        remove(_name: string, _options: any) {},
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session
}

/**
 * Require an authenticated session. Returns either:
 *   - { error: NextResponse } when unauthenticated  → return it from your handler
 *   - { session, user } when authenticated         → use it
 */
export async function requireAuth(): Promise<
  | { error: NextResponse; session: null; user: null }
  | { error: null; session: Session; user: User }
> {
  const session = await getApiSession()
  if (!session) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      session: null,
      user: null,
    }
  }
  return { error: null, session, user: session.user }
}

/**
 * Require auth AND a specific role on the user's profile.
 * Roles are stored in `profiles.role` (e.g. 'admin', 'professional', 'client').
 */
export async function requireRole(
  ...allowedRoles: string[]
): Promise<
  | { error: NextResponse; session: null; user: null; role: null }
  | { error: null; session: Session; user: User; role: string }
> {
  const auth = await requireAuth()
  if (auth.error) return { ...auth, role: null }

  // Lookup the role from the profile (uses anon key, RLS should allow user to read own)
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
        set: (_n: string, _v: string, _o: any) => {},
        // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
        remove: (_n: string, _o: any) => {},
      },
    }
  )

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
    .single()

  const role = (profile as { role?: string } | null)?.role ?? 'client'

  if (!allowedRoles.includes(role)) {
    return {
      error: NextResponse.json({ error: 'Forbidden', required: allowedRoles, got: role }, { status: 403 }),
      session: null,
      user: null,
      role: null,
    }
  }
  return { error: null, session: auth.session, user: auth.user, role }
}

/**
 * Validate a webhook token (URL ?token=... or `X-Webhook-Token` header).
 * Use this instead of requireAuth for incoming webhooks (Telegram, OpenClaw, etc.)
 *
 *   const ok = validateWebhookToken(request, process.env.TELEGRAM_WEBHOOK_TOKEN)
 *   if (!ok) return NextResponse.json({ error: 'invalid token' }, { status: 401 })
 */
export function validateWebhookToken(
  request: Request,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken) return false // env var not set → reject
  const url = new URL(request.url)
  const queryToken = url.searchParams.get('token')
  const headerToken = request.headers.get('x-webhook-token')
  const provided = queryToken || headerToken
  if (!provided) return false
  // constant-time compare to avoid timing attacks
  if (provided.length !== expectedToken.length) return false
  let diff = 0
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expectedToken.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Multi-tenant: resuelve la organización (workspace) ACTIVA del usuario.
 * - Usa profiles.active_org_id; si no es válida o no es miembro, cae a su
 *   primera membresía.
 * - Las rutas API que escriben datos deben setear `org_id: orgId` al insertar
 *   y filtrar `.eq('org_id', orgId)` al leer (el service-role bypassa RLS).
 *
 *   const org = await requireOrg()
 *   if (org.error) return org.error  // 401/403
 *   // org.orgId, org.role, org.user
 */
export async function getActiveOrg(): Promise<
  | { error: NextResponse; orgId: null; role: null; user: null }
  | { error: null; orgId: string; role: string; user: User }
> {
  const auth = await requireAuth()
  if (auth.error) return { error: auth.error, orgId: null, role: null, user: null }

  const svc = getServiceRoleClient()

  // Membresías del usuario.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: mem } = await (svc.from('organization_members') as any)
    .select('org_id, role')
    .eq('user_id', auth.user.id)
  const memberships = (mem as Array<{ org_id: string; role: string }> | null) ?? []
  const ids = memberships.map((m) => m.org_id)

  // Org activa del profile (si sigue siendo válida).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prof } = await (svc.from('profiles') as any)
    .select('active_org_id')
    .eq('id', auth.user.id)
    .single()
  let orgId: string | null = (prof as { active_org_id?: string } | null)?.active_org_id ?? null
  if (!orgId || !ids.includes(orgId)) orgId = ids[0] ?? null

  if (!orgId) {
    return {
      error: NextResponse.json(
        { error: 'no_org', hint: 'El usuario no pertenece a ninguna organización.' },
        { status: 403 },
      ),
      orgId: null,
      role: null,
      user: null,
    }
  }

  const role = memberships.find((m) => m.org_id === orgId)?.role ?? 'member'
  return { error: null, orgId, role, user: auth.user }
}

/** Alias semántico. */
export async function requireOrg() {
  return getActiveOrg()
}
