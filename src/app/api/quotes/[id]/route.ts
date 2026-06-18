import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * /api/quotes/[id]
 *
 * GET    → cotización (quotes_view) + sus líneas.
 * PATCH  → actualiza estado / fechas / notas (cambios de estado del flujo).
 * DELETE → elimina (las líneas caen por ON DELETE CASCADE).
 */

const quotePatchSchema = z.object({
  status: z
    .enum(['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted', 'cancelled'])
    .optional(),
  valid_until: z.string().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  terms_and_conditions: z.string().max(10000).optional().nullable(),
})

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()

  const { data: quote, error } = await supabase
    .from('quotes_view')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !quote) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: items } = await supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', params.id)
    .order('order_index', { ascending: true })

  return NextResponse.json({ quote, items: items ?? [] })
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  let parsed: z.infer<typeof quotePatchSchema>
  try {
    parsed = quotePatchSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const update: Record<string, unknown> = { ...parsed }
  if (parsed.status === 'converted') update.converted_at = new Date().toISOString()

  const supabase = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('quotes') as any)
    .update(update)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, quote: data })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('quotes') as any).delete().eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
