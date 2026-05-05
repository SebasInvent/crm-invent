import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAriaAuth, logAriaAction } from '@/lib/aria-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * POST /api/aria/actions/leads/create
 *
 * Create a new lead. Aria uses this when scraping social signals or
 * during a chat with the user where a new prospect emerges.
 */

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  jung_archetype: z
    .enum([
      'hero_entrepreneur',
      'sage_conservative',
      'caregiver_stressed',
      'artist_specialist',
      'ruler_executive',
      'explorer_merchant',
    ])
    .optional()
    .nullable(),
  lead_status: z.enum(['hot', 'warm', 'cold', 'dead', 'converted']).optional().default('warm'),
  lead_score: z.number().int().min(0).max(100).optional().default(50),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional().default('medium'),
  next_follow_up_date: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
})

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'aria-lead-create' })
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('leads') as any)
      .insert(parsed)
      .select('id, name, email, lead_status, lead_score')
      .single()

    if (error) throw new Error(error.message)

    logAriaAction('leads.create', parsed, 'ok')
    return NextResponse.json({
      ok: true,
      lead: data,
      message: `Lead creado: ${parsed.name} (${parsed.lead_status})`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    logAriaAction('leads.create', parsed, 'error', msg)
    return NextResponse.json({ error: 'Create failed', details: msg }, { status: 500 })
  }
}
