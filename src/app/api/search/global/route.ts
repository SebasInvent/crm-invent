import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOrg } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET /api/search/global?q=...&limit=8
 *
 * Authenticated, rate-limited global search across CRM entities for
 * the Cmd+K palette. Returns up to `limit` matches per entity.
 *
 * Entities: contacts, leads, deals. Uses ilike against the columns
 * that humans actually search by (name, email, phone, company).
 *
 * For now we use ilike — Postgres handles small datasets fine. If we
 * ever cross ~50k rows, swap to pg_trgm or to_tsvector with a GIN
 * index without changing this contract.
 */

const querySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(8),
})

type SearchHit = {
  id: string
  entity: 'contact' | 'lead' | 'deal'
  title: string
  subtitle?: string
  href: string
  meta?: Record<string, unknown>
}

export async function GET(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 90, key: 'search-global' })
  if (block) return block

  const org = await requireOrg()
  if (org.error) return org.error

  const url = new URL(request.url)
  let parsed: z.infer<typeof querySchema>
  try {
    parsed = querySchema.parse({
      q: url.searchParams.get('q'),
      limit: url.searchParams.get('limit') ?? 8,
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
  const limit = parsed.limit

  try {
    const [contactsRes, leadsRes, dealsRes] = await Promise.all([
      supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone, company_name, type')
        .in('org_id', org.accessibleOrgIds)
        .or(
          `first_name.ilike.${ilike},last_name.ilike.${ilike},email.ilike.${ilike},phone.ilike.${ilike},company_name.ilike.${ilike}`,
        )
        .limit(limit),
      supabase
        .from('leads')
        .select('id, name, email, company, lead_status, lead_score')
        .in('org_id', org.accessibleOrgIds)
        .or(`name.ilike.${ilike},email.ilike.${ilike},company.ilike.${ilike}`)
        .order('lead_score', { ascending: false })
        .limit(limit),
      supabase
        .from('deals_full')
        .select('id, name, value, status, contact_first_name, contact_last_name, contact_company')
        // deals_full arrastra d.org_id desde 024_views_org_id.sql
        .in('org_id', org.accessibleOrgIds)
        .or(
          `name.ilike.${ilike},contact_first_name.ilike.${ilike},contact_last_name.ilike.${ilike},contact_company.ilike.${ilike}`,
        )
        .limit(limit),
    ])

    const hits: SearchHit[] = []

    for (const c of (contactsRes.data || []) as any[]) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || '(sin nombre)'
      const subtitle = [c.company_name, c.email].filter(Boolean).join(' · ')
      hits.push({
        id: c.id,
        entity: 'contact',
        title: name,
        subtitle: subtitle || undefined,
        href: `/dashboard/contacts/${c.id}`,
        meta: { type: c.type },
      })
    }

    for (const l of (leadsRes.data || []) as any[]) {
      const subtitle = [l.company, l.email].filter(Boolean).join(' · ')
      hits.push({
        id: l.id,
        entity: 'lead',
        title: l.name,
        subtitle: subtitle || undefined,
        href: `/dashboard/leads/${l.id}`,
        meta: { lead_status: l.lead_status, lead_score: l.lead_score },
      })
    }

    for (const d of (dealsRes.data || []) as any[]) {
      const contact = [d.contact_first_name, d.contact_last_name].filter(Boolean).join(' ').trim()
      const subtitle = [contact, d.contact_company, d.value ? `$${d.value.toLocaleString()}` : null]
        .filter(Boolean)
        .join(' · ')
      hits.push({
        id: d.id,
        entity: 'deal',
        title: d.name,
        subtitle: subtitle || undefined,
        href: `/dashboard/pipeline`,
        meta: { status: d.status, value: d.value },
      })
    }

    return NextResponse.json({ ok: true, query: parsed.q, hits })
  } catch (err) {
    return NextResponse.json(
      { error: 'Search failed', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
