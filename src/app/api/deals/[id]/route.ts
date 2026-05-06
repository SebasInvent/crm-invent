import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'
import { recordActivity, type ActivityType } from '@/lib/activity-log'

/**
 * GET    /api/deals/[id]   read full deal (uses deals_full view if available)
 * PATCH  /api/deals/[id]   update fields (auto-logs stage/value/status changes)
 * DELETE /api/deals/[id]   hard delete (deals don't soft-delete by convention)
 */

const dealPatchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    stage_id: z.string().uuid().nullable().optional(),
    value: z.coerce.number().min(0).max(1_000_000_000).optional(),
    currency: z.enum(['USD', 'COP', 'EUR', 'MXN', 'BRL']).optional(),
    probability: z.coerce.number().int().min(0).max(100).optional(),
    expected_close_date: z.string().nullable().optional(),
    actual_close_date: z.string().nullable().optional(),
    status: z.enum(['open', 'won', 'lost', 'paused']).optional(),
    won_reason: z.string().max(500).nullable().optional(),
    lost_reason: z.string().max(500).nullable().optional(),
    competitor: z.string().max(200).nullable().optional(),
    owner_id: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' })

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  if (!params.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('deals_full')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, deal: data })
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'deals-patch' })
  if (block) return block

  const auth = await requireAuth()
  if (auth.error) return auth.error
  if (!params.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  let parsed: z.infer<typeof dealPatchSchema>
  try {
    parsed = dealPatchSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  // Look up the previous state so we can log meaningful diffs
  const { data: before } = await supabase
    .from('deals')
    .select('contact_id, name, stage_id, value, status')
    .eq('id', params.id)
    .single()

  const patch: Record<string, unknown> = {
    ...parsed,
    updated_at: new Date().toISOString(),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('deals') as any)
    .update(patch)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit trail — pick the most-relevant activity type based on what changed
  if (before && data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = before as any
    let activity_type: ActivityType = 'note'
    let title = `Deal actualizado: ${b.name}`
    if (parsed.status === 'won' && b.status !== 'won') {
      activity_type = 'deal_won'
      title = `Deal ganado: ${b.name}`
    } else if (parsed.status === 'lost' && b.status !== 'lost') {
      activity_type = 'deal_lost'
      title = `Deal perdido: ${b.name}`
    } else if (parsed.stage_id && parsed.stage_id !== b.stage_id) {
      activity_type = 'deal_moved'
      title = `Deal movido: ${b.name}`
    } else if (parsed.value !== undefined && parsed.value !== b.value) {
      activity_type = 'deal_value_change'
      title = `Valor del deal actualizado: ${b.name}`
    }
    recordActivity(supabase, {
      contact_id: b.contact_id,
      deal_id: params.id,
      activity_type,
      title,
      description: null,
      metadata: {
        actor_user_id: auth.user.id,
        actor_email: auth.user.email,
        before: b,
        patch: parsed,
      },
    })
  }

  return NextResponse.json({ ok: true, deal: data })
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'deals-delete' })
  if (block) return block

  const auth = await requireAuth()
  if (auth.error) return auth.error
  if (!params.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = getServiceRoleClient()

  // Capture for audit before delete
  const { data: before } = await supabase
    .from('deals')
    .select('contact_id, name')
    .eq('id', params.id)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('deals') as any).delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (before) {
    recordActivity(supabase, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contact_id: (before as any).contact_id,
      activity_type: 'note',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      title: `Deal eliminado: ${(before as any).name}`,
      metadata: { actor_user_id: auth.user.id, actor_email: auth.user.email, deal_id: params.id },
    })
  }

  return NextResponse.json({ ok: true })
}
