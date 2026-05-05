import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * PATCH /api/saved-views/[id]   rename/repin/edit filters
 * DELETE /api/saved-views/[id]  delete a view
 *
 * Both check ownership server-side (user_id == session.user.id) in
 * addition to the RLS policy on the table.
 */

const patchSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    is_pinned: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'saved-views-patch' })
  if (block) return block
  const auth = await requireAuth()
  if (auth.error) return auth.error

  let parsed: z.infer<typeof patchSchema>
  try {
    parsed = patchSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  // Ownership check
  const { data: existing } = await supabase
    .from('saved_views')
    .select('user_id')
    .eq('id', params.id)
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!existing || (existing as any).user_id !== auth.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('saved_views') as any)
    .update(parsed)
    .eq('id', params.id)
    .select('id, name, filters, is_pinned, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, view: data })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'saved-views-delete' })
  if (block) return block
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()
  const { data: existing } = await supabase
    .from('saved_views')
    .select('user_id')
    .eq('id', params.id)
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!existing || (existing as any).user_id !== auth.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('saved_views') as any).delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
