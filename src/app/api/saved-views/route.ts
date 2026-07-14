import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOrg } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET  /api/saved-views?entity=leads
 *      List the current user's saved views for an entity, pinned first.
 *
 * POST /api/saved-views
 *      Create a saved view.
 *      Body: { entity, name, filters: {...}, is_pinned? }
 *
 * Both endpoints scope to the authenticated user. RLS would also
 * enforce this, but we apply the user_id server-side defensively.
 */

const entityEnum = z.enum(['leads', 'contacts', 'deals'])

const createSchema = z.object({
  entity: entityEnum,
  name: z.string().min(1).max(80),
  filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  is_pinned: z.boolean().optional().default(false),
})

const querySchema = z.object({
  entity: entityEnum,
})

export async function GET(request: Request) {
  const org = await requireOrg()
  if (org.error) return org.error

  const url = new URL(request.url)
  let parsed: z.infer<typeof querySchema>
  try {
    parsed = querySchema.parse({ entity: url.searchParams.get('entity') })
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid query', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('saved_views')
    .select('id, name, filters, is_pinned, created_at, updated_at')
    .eq('org_id', org.orgId)
    .eq('user_id', org.user.id)
    .eq('entity', parsed.entity)
    .order('is_pinned', { ascending: false })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, views: data || [] })
}

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'saved-views-create' })
  if (block) return block

  const org = await requireOrg()
  if (org.error) return org.error

  let parsed: z.infer<typeof createSchema>
  try {
    parsed = createSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('saved_views') as any)
    .insert({
      user_id: org.user.id,
      entity: parsed.entity,
      name: parsed.name,
      filters: parsed.filters,
      is_pinned: parsed.is_pinned,
      org_id: org.orgId,
    })
    .select('id, name, filters, is_pinned, created_at, updated_at')
    .single()

  if (error) {
    if (String(error.message).includes('saved_views_unique_name_per_user')) {
      return NextResponse.json(
        { error: 'Ya tienes una vista con ese nombre' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, view: data })
}
