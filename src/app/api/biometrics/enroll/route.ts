import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  embedding512: z.string(),
  embeddingQuality: z.number().optional(),
  livenessScore: z.number().optional(),
  spoofScore: z.number().optional(),
  // Habeas Data (Ley 1581): el rostro es dato sensible → consentimiento obligatorio
  consent: z.literal(true),
})

/**
 * Enrola (o re-enrola) el rostro del usuario AUTENTICADO. Consent-gated.
 * Guarda solo el embedding (no la foto cruda) ligado a auth.users.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Datos inválidos o falta el consentimiento de tratamiento de datos.' },
      { status: 400 },
    )
  }

  let embedding: number[]
  try {
    embedding = JSON.parse(parsed.data.embedding512)
  } catch {
    return NextResponse.json({ success: false, message: 'Embedding inválido' }, { status: 400 })
  }
  if (!Array.isArray(embedding) || embedding.length !== 512) {
    return NextResponse.json({ success: false, message: 'El embedding debe tener 512 dimensiones.' }, { status: 400 })
  }

  const supabase = getServiceRoleClient()
  const { error } = await supabase.from('face_credentials' as never).upsert(
    {
      user_id: auth.user.id,
      embedding512: embedding,
      embedding_quality: parsed.data.embeddingQuality ?? null,
      liveness_score: parsed.data.livenessScore ?? null,
      spoof_score: parsed.data.spoofScore ?? null,
      consent_at: new Date().toISOString(),
      status: 'active',
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: 'user_id' },
  )

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

/**
 * Elimina la credencial facial del usuario autenticado (derecho al olvido — Habeas Data).
 */
export async function DELETE() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()
  await supabase.from('face_credentials' as never).delete().eq('user_id' as never, auth.user.id)
  return NextResponse.json({ success: true })
}
