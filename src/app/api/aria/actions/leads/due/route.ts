import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAriaAuth, logAriaAction } from '@/lib/aria-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

const querySchema = z.object({
  product_slug: z.string().max(80).optional(),
  due_before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

/**
 * GET /api/aria/actions/leads/due?product_slug=tickean&limit=50
 *
 * Seller-safe work queue for n8n. It only returns leads with an explicit
 * next_follow_up_date that is already due, excluding dead/converted records.
 */
export async function GET(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'aria-leads-due' })
  if (block) return block

  const auth = requireAriaAuth(request)
  if (auth.error) return auth.error

  const url = new URL(request.url)
  let parsed: z.infer<typeof querySchema>
  try {
    parsed = querySchema.parse({
      product_slug: url.searchParams.get('product_slug') || undefined,
      due_before: url.searchParams.get('due_before') || undefined,
      limit: url.searchParams.get('limit') ?? 50,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid query', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()
  try {
    let productId: string | null = null
    if (parsed.product_slug) {
      const { data: product, error } = await supabase
        .from('products')
        .select('id')
        .eq('slug', parsed.product_slug)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!product) {
        return NextResponse.json({ error: `Producto '${parsed.product_slug}' no existe` }, { status: 404 })
      }
      productId = (product as { id: string }).id
    }

    const dueBefore = parsed.due_before ?? new Date().toISOString()
    let query = supabase
      .from('leads')
      .select(
        'id, name, email, phone, company, lead_status, lead_score, priority, next_follow_up_date, notes, source, source_url, source_platform, communication_channel, consent_status, tags, product_id, updated_at',
      )
      .not('next_follow_up_date', 'is', null)
      .lte('next_follow_up_date', dueBefore)
      .neq('lead_status', 'dead')
      .neq('lead_status', 'converted')
      .order('next_follow_up_date', { ascending: true })
      .order('lead_score', { ascending: false })
      .limit(parsed.limit)
    if (productId) query = query.eq('product_id', productId)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    logAriaAction('leads.due', parsed, 'ok')
    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      due_before: dueBefore,
      product_slug: parsed.product_slug ?? null,
      count: data?.length ?? 0,
      leads: data ?? [],
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    logAriaAction('leads.due', parsed, 'error', msg)
    return NextResponse.json({ error: 'Due leads query failed', details: msg }, { status: 500 })
  }
}
