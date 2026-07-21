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

const cadenceHours: Record<string, number> = { cold: 0, warm: 48, hot: 24 }

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
      const { data: product, error } = await supabase.from('products').select('id').eq('slug', parsed.product_slug).maybeSingle()
      if (error) throw new Error(error.message)
      if (!product) return NextResponse.json({ error: `Producto '${parsed.product_slug}' no existe` }, { status: 404 })
      productId = (product as { id: string }).id
    }

    let query = supabase
      .from('leads')
      .select('id, name, email, phone, company, lead_status, lead_score, priority, notes, source, source_platform, location, tags, product_id, created_at, updated_at')
      .neq('lead_status', 'dead')
      .neq('lead_status', 'converted')
      .order('lead_score', { ascending: false })
      .limit(200)
    if (productId) query = query.eq('product_id', productId)
    const { data, error } = await query
    if (error) throw new Error(error.message)

    const dueBeforeMs = new Date(parsed.due_before ?? new Date().toISOString()).getTime()
    const due = (data ?? [])
      .map((lead: any) => {
        const base = new Date(lead.updated_at ?? lead.created_at).getTime()
        const hours = cadenceHours[lead.lead_status] ?? 48
        const nextMs = base + hours * 60 * 60 * 1000
        return {
          ...lead,
          next_follow_up_date: new Date(nextMs).toISOString(),
          due_reason: lead.lead_status === 'cold' ? 'revisión y aprobación inicial' : `seguimiento ${lead.lead_status}`,
        }
      })
      .filter((lead: any) => new Date(lead.next_follow_up_date).getTime() <= dueBeforeMs)
      .sort((a: any, b: any) => new Date(a.next_follow_up_date).getTime() - new Date(b.next_follow_up_date).getTime())
      .slice(0, parsed.limit)

    logAriaAction('leads.due', parsed, 'ok')
    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      due_before: new Date(dueBeforeMs).toISOString(),
      product_slug: parsed.product_slug ?? null,
      cadence_model: 'cold=now,warm=48h,hot=24h (derived from updated_at)',
      count: due.length,
      leads: due,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    logAriaAction('leads.due', parsed, 'error', msg)
    return NextResponse.json({ error: 'Due leads query failed', details: msg }, { status: 500 })
  }
}
