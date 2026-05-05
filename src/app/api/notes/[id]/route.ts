import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * PATCH /api/notes/[id]   update body (only the author can edit)
 * DELETE /api/notes/[id]  delete (only the author can delete)
 *
 * Author check is server-side: we look up the note's author_id and
 * compare to the current session.user.id. RLS bypassed via service
 * role for the lookup but we enforce ownership explicitly.
 */

const patchSchema = z.object({
  body: z.string().min(1).max(5000),
})

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'notes-patch' })
  if (block) return block

  const auth = await requireAuth()
  if (auth.error) return auth.error

  const id = params.id
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

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
  const { data: existing, error: lookupErr } = await supabase
    .from('notes')
    .select('author_id')
    .eq('id', id)
    .single()
  if (lookupErr || !existing) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((existing as any).author_id !== auth.user.id) {
    return NextResponse.json(
      { error: 'Forbidden — only the author can edit this note' },
      { status: 403 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('notes') as any)
    .update({ body: parsed.body })
    .eq('id', id)
    .select('id, body, author_email, author_id, created_at, updated_at, lead_id, contact_id, deal_id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, note: data })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'notes-delete' })
  if (block) return block

  const auth = await requireAuth()
  if (auth.error) return auth.error

  const id = params.id
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = getServiceRoleClient()

  const { data: existing } = await supabase
    .from('notes')
    .select('author_id')
    .eq('id', id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((existing as any).author_id !== auth.user.id) {
    return NextResponse.json(
      { error: 'Forbidden — only the author can delete this note' },
      { status: 403 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('notes') as any).delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
