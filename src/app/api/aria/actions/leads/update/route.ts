import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAriaAuth, logAriaAction } from '@/lib/aria-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * PATCH /api/aria/actions/leads/update
 *
 * Update a lead's status, score, follow-up date or notes. Aria uses
 * this to "warm up" or "cool down" leads after a conversation, and
 * to schedule follow-ups from a chat command.
 *
 * Body must include `id`. All other fields are optional patches.
 */

const bodySchema = z
  .object({
    id: z.string().uuid(),
    lead_status: z.enum(['hot', 'warm', 'cold', 'dead', 'converted']).optional(),
    lead_score: z.number().int().min(0).max(100).optional(),
    priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
    jung_archetype: z
      .enum([
        'hero_entrepreneur',
        'sage_conservative',
        'caregiver_stressed',
        'artist_specialist',
        'ruler_executive',
        'explorer_merchant',
      ])
      .optional(),
    next_follow_up_date: z.string().datetime().nullable().optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (v) => Object.keys(v).length > 1, // more than just `id`
    { message: 'At least one field besides `id` must be provided' },
  )

export async function PATCH(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'aria-lead-update' })
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

  const { id, ...patch } = parsed
  const supabase = getServiceRoleClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('leads') as any)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, name, lead_status, lead_score, next_follow_up_date')
      .single()

    if (error) throw new Error(error.message)

    logAriaAction('leads.update', { id, ...patch }, 'ok')
    return NextResponse.json({
      ok: true,
      lead: data,
      message: `Lead actualizado${data?.name ? ': ' + data.name : ''}`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    logAriaAction('leads.update', { id, ...patch }, 'error', msg)
    return NextResponse.json({ error: 'Update failed', details: msg }, { status: 500 })
  }
}
