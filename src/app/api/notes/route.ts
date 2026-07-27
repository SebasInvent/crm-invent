import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOrg } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET  /api/notes?lead_id=...|contact_id=...|deal_id=...
 *      List notes attached to a single entity, newest first.
 *
 * POST /api/notes
 *      Create a note. Body must include `body` and exactly one of
 *      lead_id / contact_id / deal_id (the DB enforces this too).
 *
 * Both require auth. Author is captured server-side from the session
 * — clients can't impersonate.
 */

const querySchema = z
  .object({
    lead_id: z.string().uuid().optional(),
    contact_id: z.string().uuid().optional(),
    deal_id: z.string().uuid().optional(),
  })
  .refine(
    (v) =>
      Number(!!v.lead_id) + Number(!!v.contact_id) + Number(!!v.deal_id) === 1,
    { message: 'Provide exactly one of lead_id / contact_id / deal_id' },
  )

const bodySchema = z
  .object({
    body: z.string().min(1).max(5000),
    lead_id: z.string().uuid().optional(),
    contact_id: z.string().uuid().optional(),
    deal_id: z.string().uuid().optional(),
  })
  .refine(
    (v) =>
      Number(!!v.lead_id) + Number(!!v.contact_id) + Number(!!v.deal_id) === 1,
    { message: 'Provide exactly one of lead_id / contact_id / deal_id' },
  )

export async function GET(request: Request) {
  const org = await requireOrg()
  if (org.error) return org.error

  const url = new URL(request.url)
  let parsed: z.infer<typeof querySchema>
  try {
    parsed = querySchema.parse({
      lead_id: url.searchParams.get('lead_id') || undefined,
      contact_id: url.searchParams.get('contact_id') || undefined,
      deal_id: url.searchParams.get('deal_id') || undefined,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid query', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()
  let query = supabase
    .from('notes')
    .select('id, body, author_email, author_id, created_at, updated_at, lead_id, contact_id, deal_id')
    .in('org_id', org.accessibleOrgIds)
    .order('created_at', { ascending: false })
    .limit(200)

  if (parsed.lead_id) query = query.eq('lead_id', parsed.lead_id)
  else if (parsed.contact_id) query = query.eq('contact_id', parsed.contact_id)
  else if (parsed.deal_id) query = query.eq('deal_id', parsed.deal_id)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, notes: data || [] })
}

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'notes-create' })
  if (block) return block

  const org = await requireOrg()
  if (org.error) return org.error

  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  const insert = {
    body: parsed.body,
    lead_id: parsed.lead_id ?? null,
    contact_id: parsed.contact_id ?? null,
    deal_id: parsed.deal_id ?? null,
    author_id: org.user.id,
    author_email: org.user.email ?? null,
    org_id: org.orgId,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('notes') as any)
    .insert(insert)
    .select('id, body, author_email, author_id, created_at, updated_at, lead_id, contact_id, deal_id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, note: data })
}
