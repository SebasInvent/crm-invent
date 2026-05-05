import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAriaAuth, logAriaAction } from '@/lib/aria-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET /api/aria/actions/search?q=...&entity=contact|lead|deal&limit=10
 *
 * Read-only search across the CRM. Aria uses this to answer "do we
 * have a lead for X?" or "find John's email" without needing the user
 * to click around.
 */

const querySchema = z.object({
  q: z.string().min(1).max(200),
  entity: z.enum(['contact', 'lead', 'deal', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

export async function GET(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'aria-search' })
  if (block) return block

  const auth = requireAriaAuth(request)
  if (auth.error) return auth.error

  const url = new URL(request.url)
  let parsed: z.infer<typeof querySchema>
  try {
    parsed = querySchema.parse({
      q: url.searchParams.get('q'),
      entity: url.searchParams.get('entity') ?? 'all',
      limit: url.searchParams.get('limit') ?? 10,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid query', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()
  const term = parsed.q.replace(/[%]/g, '')
  const ilike = `%${term}%`
  const results: Record<string, unknown[]> = {}

  try {
    if (parsed.entity === 'contact' || parsed.entity === 'all') {
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone, company_name, type, lead_score')
        .or(`first_name.ilike.${ilike},last_name.ilike.${ilike},email.ilike.${ilike},phone.ilike.${ilike},company_name.ilike.${ilike}`)
        .limit(parsed.limit)
      results.contacts = data || []
    }

    if (parsed.entity === 'lead' || parsed.entity === 'all') {
      const { data } = await supabase
        .from('leads')
        .select('id, name, email, phone, company, lead_status, lead_score, jung_archetype, next_follow_up_date')
        .or(`name.ilike.${ilike},email.ilike.${ilike},company.ilike.${ilike}`)
        .order('lead_score', { ascending: false })
        .limit(parsed.limit)
      results.leads = data || []
    }

    if (parsed.entity === 'deal' || parsed.entity === 'all') {
      const { data } = await supabase
        .from('deals_full')
        .select('id, name, value, status, stage_id, contact_first_name, contact_last_name, contact_company, expected_close_date')
        .or(`name.ilike.${ilike},contact_first_name.ilike.${ilike},contact_last_name.ilike.${ilike},contact_company.ilike.${ilike}`)
        .limit(parsed.limit)
      results.deals = data || []
    }

    logAriaAction('search', parsed, 'ok')
    return NextResponse.json({ ok: true, query: parsed.q, results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    logAriaAction('search', parsed, 'error', msg)
    return NextResponse.json({ error: 'Search failed', details: msg }, { status: 500 })
  }
}
