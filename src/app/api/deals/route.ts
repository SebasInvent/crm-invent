import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOrg } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'
import { recordActivity } from '@/lib/activity-log'

/**
 * POST /api/deals
 *
 * Create a deal tied to a contact. The pipeline page used to insert
 * directly via the supabase client (no validation, no audit), this
 * route replaces that path.
 */

const dealCreateSchema = z.object({
  name: z.string().min(1).max(200),
  contact_id: z.string().uuid(),
  description: z.string().max(2000).optional().nullable(),
  pipeline_id: z.string().uuid().optional().nullable(),
  stage_id: z.string().uuid().optional().nullable(),
  product_id: z.string().uuid().optional().nullable(),
  value: z.coerce.number().min(0).max(1_000_000_000).optional().default(0),
  currency: z.enum(['USD', 'COP', 'EUR', 'MXN', 'BRL']).optional().default('USD'),
  probability: z.coerce.number().int().min(0).max(100).optional().default(0),
  expected_close_date: z.string().optional().nullable(),
  status: z.enum(['open', 'won', 'lost', 'paused']).optional().default('open'),
  competitor: z.string().max(200).optional().nullable(),
  owner_id: z.string().uuid().optional().nullable(),
})

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'deals-create' })
  if (block) return block

  const org = await requireOrg()
  if (org.error) return org.error

  let parsed: z.infer<typeof dealCreateSchema>
  try {
    parsed = dealCreateSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  const { data: contact } = await (supabase.from('contacts') as any)
    .select('id')
    .eq('id', parsed.contact_id)
    .in('org_id', org.accessibleOrgIds)
    .maybeSingle()
  if (!contact) return NextResponse.json({ error: 'Contact not found in the connected network' }, { status: 404 })

  if (parsed.pipeline_id) {
    const { data: pipeline } = await (supabase.from('pipelines') as any)
      .select('id, product_id')
      .eq('id', parsed.pipeline_id)
      .eq('org_id', org.orgId)
      .maybeSingle()
    if (!pipeline) return NextResponse.json({ error: 'Pipeline not found in active workspace' }, { status: 404 })
    if (parsed.product_id && pipeline.product_id !== parsed.product_id) {
      return NextResponse.json({ error: 'Product does not match pipeline' }, { status: 400 })
    }
  }

  // If stage_id is given but probability isn't, look up the stage's
  // default probability so the kanban renders correctly.
  let probability = parsed.probability
  if (parsed.stage_id && parsed.probability === 0) {
    const { data: stage } = await supabase
      .from('pipeline_stages')
      .select('default_probability')
      .eq('id', parsed.stage_id)
      .single()
    if (stage) {
      probability = (stage as { default_probability: number }).default_probability
    }
  }

  const insert = {
    name: parsed.name,
    contact_id: parsed.contact_id,
    description: parsed.description,
    pipeline_id: parsed.pipeline_id,
    stage_id: parsed.stage_id,
    product_id: parsed.product_id,
    value: parsed.value,
    currency: parsed.currency,
    probability,
    expected_close_date: parsed.expected_close_date || null,
    status: parsed.status,
    competitor: parsed.competitor,
    owner_id: parsed.owner_id,
    created_by: org.user.id,
    org_id: org.orgId,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('deals') as any)
    .insert(insert)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit trail
  if (data?.id) {
    recordActivity(supabase, {
      contact_id: parsed.contact_id,
      deal_id: data.id,
      activity_type: 'deal_created',
      title: `Deal creado: ${parsed.name}`,
      description: parsed.description ?? null,
      metadata: {
        actor_user_id: org.user.id,
        actor_email: org.user.email,
        value: parsed.value,
        currency: parsed.currency,
      },
    })
  }

  return NextResponse.json({ ok: true, deal: data })
}
