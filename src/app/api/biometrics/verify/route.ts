import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServiceRoleClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mismos umbrales que el motor de Medicare (BIOMETRIC_V2_ARCHITECTURE.md)
const MATCH_THRESHOLD = 0.45 // distancia coseno
const MIN_LIVENESS = 60
const MAX_SPOOF = 40

const schema = z.object({
  embedding512: z.string(), // JSON array de 512 floats
  livenessScore: z.number(),
  spoofScore: z.number(),
})

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  if (denom === 0) return 1
  return 1 - dot / denom
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logAttempt(supabase: any, row: Record<string, unknown>) {
  try {
    await supabase.from('face_login_attempts').insert(row)
  } catch {
    /* auditoría best-effort */
  }
}

/**
 * Login facial. PÚBLICO: recibe el embedding extraído en el navegador, lo compara
 * contra los registrados (en el servidor) y, si hay match, genera un magic-link
 * de Supabase para iniciar la sesión del usuario reconocido.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: 'Datos inválidos' }, { status: 400 })
  }
  const { embedding512, livenessScore, spoofScore } = parsed.data
  const supabase = getServiceRoleClient()

  // Gates de vida / anti-spoof (calculados en el cliente; gate básico + auditoría)
  if (livenessScore < MIN_LIVENESS) {
    await logAttempt(supabase, { success: false, liveness_score: livenessScore, spoof_score: spoofScore, reason: 'liveness' })
    return NextResponse.json({ success: false, decision: 'LIVENESS_FAILED', message: 'No se detectó prueba de vida suficiente.' })
  }
  if (spoofScore > MAX_SPOOF) {
    await logAttempt(supabase, { success: false, liveness_score: livenessScore, spoof_score: spoofScore, reason: 'spoof' })
    return NextResponse.json({ success: false, decision: 'SPOOF_DETECTED', message: 'Posible suplantación detectada.' })
  }

  let probe: number[]
  try {
    probe = JSON.parse(embedding512)
  } catch {
    return NextResponse.json({ success: false, message: 'Embedding inválido' }, { status: 400 })
  }
  if (!Array.isArray(probe) || probe.length === 0) {
    return NextResponse.json({ success: false, message: 'Embedding inválido' }, { status: 400 })
  }

  // Cargar credenciales activas y comparar EN EL SERVIDOR
  const { data: creds } = await supabase
    .from('face_credentials' as never)
    .select('user_id, embedding512')
    .eq('status' as never, 'active')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (creds as any[]) || []

  if (list.length === 0) {
    return NextResponse.json({
      success: false,
      decision: 'NO_USERS',
      isNotRegistered: true,
      message: 'Aún no hay rostros registrados. Enrola el tuyo desde Ajustes.',
    })
  }

  let best: { userId: string; distance: number } | null = null
  for (const c of list) {
    const stored =
      Array.isArray(c.embedding512) ? c.embedding512 : typeof c.embedding512 === 'string' ? JSON.parse(c.embedding512) : null
    if (!stored || stored.length !== probe.length) continue
    const d = cosineDistance(probe, stored)
    if (!best || d < best.distance) best = { userId: c.user_id, distance: d }
  }

  if (!best || best.distance >= MATCH_THRESHOLD) {
    await logAttempt(supabase, {
      success: false,
      user_id: best?.userId ?? null,
      distance: best?.distance ?? null,
      liveness_score: livenessScore,
      spoof_score: spoofScore,
      reason: 'no_match',
    })
    return NextResponse.json({ success: false, decision: 'NO_MATCH', message: 'No se reconoció tu rostro. Intenta de nuevo.' })
  }

  // Obtener email del usuario reconocido
  const { data: userRes } = await supabase.auth.admin.getUserById(best.userId)
  const email = userRes?.user?.email
  if (!email) {
    return NextResponse.json({ success: false, message: 'El usuario no tiene email asociado.' }, { status: 500 })
  }

  // Puente con Supabase Auth: magic-link → token de un solo uso → verifyOtp en el cliente
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenHash = (linkData as any)?.properties?.hashed_token
  if (linkErr || !tokenHash) {
    return NextResponse.json({ success: false, message: 'No se pudo iniciar la sesión.' }, { status: 500 })
  }

  await logAttempt(supabase, {
    success: true,
    user_id: best.userId,
    distance: best.distance,
    liveness_score: livenessScore,
    spoof_score: spoofScore,
    reason: 'match',
  })

  const confidence = Math.round(Math.max(0, Math.min(100, (1 - best.distance / 2) * 100)))

  return NextResponse.json({
    success: true,
    decision: 'MATCH',
    email,
    tokenHash,
    confidence,
    distance: best.distance,
  })
}
