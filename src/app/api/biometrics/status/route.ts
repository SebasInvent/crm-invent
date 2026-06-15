import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** ¿El usuario autenticado tiene rostro enrolado? (para la pantalla de Ajustes) */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()
  const { data } = await supabase
    .from('face_credentials' as never)
    .select('status, embedding_quality, updated_at')
    .eq('user_id' as never, auth.user.id)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any
  return NextResponse.json({
    enrolled: !!row && row.status === 'active',
    quality: row?.embedding_quality ?? null,
    updatedAt: row?.updated_at ?? null,
  })
}
