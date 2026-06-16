import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Panel de diagnóstico biométrico del usuario autenticado.
 * Muestra:
 *  - Si tiene credencial facial y CUÁNDO se enroló (para saber si es vieja o post-fix)
 *  - Calidad del embedding
 *  - Últimos 10 intentos de login facial con distancia coseno
 *
 * Acceso: cualquier usuario logueado puede ver SU propio diagnóstico.
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()

  const { data: cred } = await supabase
    .from('face_credentials' as never)
    .select('status, embedding_quality, liveness_score, spoof_score, created_at, updated_at')
    .eq('user_id' as never, auth.user.id)
    .maybeSingle()

  const { data: attempts } = await supabase
    .from('face_login_attempts' as never)
    .select('success, distance, liveness_score, spoof_score, reason, created_at')
    .eq('user_id' as never, auth.user.id)
    .order('created_at' as never, { ascending: false })
    .limit(10)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = cred as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = (attempts as any[]) || []

  const FIX_CROP_DEPLOY_AT = new Date('2026-06-16T13:30:00Z').toISOString()
  const enrolledAt = c?.updated_at ?? null
  const enrolledAfterFix =
    !!enrolledAt && new Date(enrolledAt).getTime() > new Date(FIX_CROP_DEPLOY_AT).getTime()

  return NextResponse.json({
    user_id: auth.user.id,
    email: auth.user.email,
    credential: c
      ? {
          status: c.status,
          quality: c.embedding_quality,
          liveness: c.liveness_score,
          spoof: c.spoof_score,
          enrolled_at: c.created_at,
          last_updated_at: c.updated_at,
          enrolled_after_crop_fix: enrolledAfterFix,
        }
      : null,
    recent_attempts: a.map((x) => ({
      success: x.success,
      distance: x.distance,
      liveness: x.liveness_score,
      spoof: x.spoof_score,
      reason: x.reason,
      at: x.created_at,
    })),
    hints: {
      crop_fix_deployed_at: FIX_CROP_DEPLOY_AT,
      match_threshold: 0.6,
      reenroll_needed: !!c && !enrolledAfterFix,
    },
  })
}
