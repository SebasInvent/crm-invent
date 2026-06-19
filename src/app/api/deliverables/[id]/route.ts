import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * PATCH /api/deliverables/[id] → cambia estado (aprobar / marcar enviado).
 * DELETE /api/deliverables/[id] → elimina.
 */
const patchSchema = z.object({
  approved_for_send: z.boolean().optional(),
  sent_to_client: z.boolean().optional(),
  title: z.string().max(300).optional(),
  description: z.string().max(5000).optional().nullable(),
  review_notes: z.string().max(5000).optional().nullable(),
})

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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

  const update: Record<string, unknown> = { ...parsed }
  if (parsed.approved_for_send === true) update.approved_at = new Date().toISOString()
  if (parsed.sent_to_client === true) update.sent_at = new Date().toISOString()

  const supabase = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('agent_deliverables') as any)
    .update(update)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deliverable: data })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('agent_deliverables') as any).delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
