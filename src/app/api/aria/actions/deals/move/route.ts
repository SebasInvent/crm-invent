import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAriaAuth, logAriaAction } from '@/lib/aria-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'
import { recordActivity } from '@/lib/activity-log'

/**
 * POST /api/aria/actions/deals/move
 *
 * Move a deal to a different pipeline stage. Aria uses this when the
 * user says "movió la propuesta de Acme a negociación".
 *
 * Resolves the destination stage either by `stage_id` (UUID) or by
 * `stage_name` (case-insensitive) so Aria can pass natural language.
 * Updates probability to the stage's default unless explicitly set.
 */

const bodySchema = z
  .object({
    deal_id: z.string().uuid(),
    stage_id: z.string().uuid().optional(),
    stage_name: z.string().max(100).optional(),
    probability: z.number().int().min(0).max(100).optional(),
  })
  .refine((v) => v.stage_id || v.stage_name, {
    message: 'Either stage_id or stage_name is required',
  })

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'aria-deal-move' })
  if (block) return block

  const auth = requireAriaAuth(request)
  if (auth.error) return auth.error

  let parsed: z.infer<typeof bodySchema>
  try {
    const body = await request.json()
    parsed = bodySchema.parse(body)
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  try {
    const { data: sourceDeal, error: dealLookupError } = await supabase
      .from('deals')
      .select('id, pipeline_id')
      .eq('id', parsed.deal_id)
      .maybeSingle()
    if (dealLookupError) throw new Error(dealLookupError.message)
    if (!sourceDeal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }
    const sourcePipelineId = (sourceDeal as { pipeline_id: string | null }).pipeline_id

    // Resolve the destination stage
    let stage:
      | { id: string; name: string; default_probability: number; pipeline_id: string }
      | null = null

    if (parsed.stage_id) {
      const { data } = await supabase
        .from('pipeline_stages')
        .select('id, name, default_probability, pipeline_id')
        .eq('id', parsed.stage_id)
        .single()
      stage = data as typeof stage
    } else if (parsed.stage_name) {
      let query = supabase
        .from('pipeline_stages')
        .select('id, name, default_probability, pipeline_id')
        .ilike('name', `%${parsed.stage_name}%`)
        .eq('is_active', true)
      if (sourcePipelineId) query = query.eq('pipeline_id', sourcePipelineId)
      const { data } = await query
        .limit(1)
      stage = (Array.isArray(data) ? data[0] : data) as typeof stage
    }

    if (!stage) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
    }
    if (sourcePipelineId && stage.pipeline_id !== sourcePipelineId) {
      return NextResponse.json(
        { error: 'Stage does not belong to the deal pipeline' },
        { status: 409 },
      )
    }

    const probability = parsed.probability ?? stage.default_probability

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: deal, error } = await (supabase.from('deals') as any)
      .update({
        stage_id: stage.id,
        probability,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.deal_id)
      .select('id, name, value')
      .single()

    if (error) throw new Error(error.message)

    // Audit trail
    recordActivity(supabase, {
      deal_id: parsed.deal_id,
      activity_type: 'deal_moved',
      title: `Deal movido a "${stage.name}"`,
      description: `Probabilidad: ${probability}%`,
      metadata: {
        source: 'aria',
        deal_name: deal?.name,
        stage_id: stage.id,
        stage_name: stage.name,
        probability,
      },
    })

    logAriaAction('deals.move', { ...parsed, resolved_stage_id: stage.id }, 'ok')
    return NextResponse.json({
      ok: true,
      deal,
      stage: { id: stage.id, name: stage.name, probability },
      message: `Deal "${deal?.name}" movido a "${stage.name}" (${probability}%)`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    logAriaAction('deals.move', parsed, 'error', msg)
    return NextResponse.json({ error: 'Move failed', details: msg }, { status: 500 })
  }
}
