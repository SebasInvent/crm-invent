import { NextResponse } from 'next/server'
import { requireAriaAuth, logAriaAction } from '@/lib/aria-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET /api/aria/actions/pipeline-deep
 *
 * Deep snapshot of the CRM for strategic analysis. Returns more than
 * just counts: top lead-contacts ranked by score, top open deals by
 * value with stage name, deals stuck without activity (>14d), pipeline
 * stages with aggregated deal value per stage, recent chat threads.
 *
 * Use case: "qué hago con el pipeline esta semana?" — Aria pulls this
 * and reasons over the data instead of asking the user 8 follow-up
 * questions.
 *
 * Auth: ARIA_ACTION_TOKEN (same as the rest of /api/aria/actions/*).
 * Read-only, rate-limited 30/min/IP.
 */

export async function GET(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'aria-pipeline-deep' })
  if (block) return block

  const auth = requireAriaAuth(request)
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()

  try {
    const [contactsRes, dealsRes, stagesRes, threadsRes] = await Promise.all([
      supabase
        .from('contacts')
        .select(
          'id, first_name, last_name, company_name, email, phone, lead_score, priority, jung_archetype, type, created_at, industry',
        )
        .eq('type', 'lead')
        .order('lead_score', { ascending: false, nullsFirst: false })
        .limit(30),
      supabase
        .from('deals_full')
        .select(
          'id, name, value, currency, probability, status, stage_id, contact_id, contact_first_name, contact_last_name, contact_company, expected_close_date, created_at, updated_at',
        )
        .eq('status', 'open')
        .order('value', { ascending: false, nullsFirst: false })
        .limit(50),
      supabase
        .from('pipeline_stages')
        .select('id, name, default_probability, order_index')
        .eq('is_active', true)
        .order('order_index'),
      supabase
        .from('chat_threads')
        .select(
          'id, phone, contact_name, bot_type, bot_active, status, last_message_preview, last_message_at, lead_id',
        )
        .order('last_message_at', { ascending: false })
        .limit(25),
    ])

    const contacts = (contactsRes.data ?? []) as Array<Record<string, unknown>>
    const deals = (dealsRes.data ?? []) as Array<Record<string, unknown>>
    const stages = (stagesRes.data ?? []) as Array<{
      id: string
      name: string
      default_probability: number
      order_index: number
    }>
    const threads = (threadsRes.data ?? []) as Array<Record<string, unknown>>

    // Compute aggregates per stage
    const stageMap = new Map(stages.map((s) => [s.id, s]))
    const byStage = stages.map((s) => {
      const stageDeals = deals.filter((d) => d.stage_id === s.id)
      const sum = stageDeals.reduce((acc, d) => acc + (Number(d.value) || 0), 0)
      const weighted = stageDeals.reduce(
        (acc, d) => acc + ((Number(d.value) || 0) * (Number(d.probability) || 0)) / 100,
        0,
      )
      return {
        id: s.id,
        name: s.name,
        default_probability: s.default_probability,
        deal_count: stageDeals.length,
        total_value: Math.round(sum),
        weighted_value: Math.round(weighted),
      }
    })

    // Stuck deals: not updated in >14 days
    const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000
    const now = Date.now()
    const stuck = deals
      .filter((d) => {
        const u = d.updated_at ? new Date(d.updated_at as string).getTime() : 0
        return u > 0 && now - u > FOURTEEN_DAYS
      })
      .map((d) => ({
        id: d.id,
        name: d.name,
        value: d.value,
        probability: d.probability,
        contact: [d.contact_first_name, d.contact_last_name].filter(Boolean).join(' '),
        company: d.contact_company,
        stage_name: stageMap.get(d.stage_id as string)?.name ?? null,
        days_since_update: Math.floor((now - new Date(d.updated_at as string).getTime()) / (24 * 60 * 60 * 1000)),
      }))
      .slice(0, 20)

    // Decorate top deals with stage names
    const topDeals = deals.slice(0, 25).map((d) => ({
      id: d.id,
      name: d.name,
      value: d.value,
      currency: d.currency,
      probability: d.probability,
      stage_name: stageMap.get(d.stage_id as string)?.name ?? null,
      contact: [d.contact_first_name, d.contact_last_name].filter(Boolean).join(' '),
      company: d.contact_company,
      expected_close_date: d.expected_close_date,
      days_open: d.created_at
        ? Math.floor((now - new Date(d.created_at as string).getTime()) / (24 * 60 * 60 * 1000))
        : null,
    }))

    // Top lead-contacts (already sorted by score desc)
    const topLeads = contacts.slice(0, 20).map((c) => ({
      id: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(' '),
      company: c.company_name,
      email: c.email,
      phone: c.phone,
      lead_score: c.lead_score,
      priority: c.priority,
      jung_archetype: c.jung_archetype,
      industry: c.industry,
      created_at: c.created_at,
    }))

    // Active threads
    const activeThreads = threads.map((t) => ({
      id: t.id,
      phone: t.phone,
      contact_name: t.contact_name,
      bot_type: t.bot_type,
      bot_active: t.bot_active,
      status: t.status,
      preview: t.last_message_preview,
      last_message_at: t.last_message_at,
      lead_id: t.lead_id,
    }))

    const summary = {
      counts: {
        lead_contacts: contacts.length,
        open_deals: deals.length,
        stuck_deals: stuck.length,
        active_threads: threads.length,
      },
      pipeline_by_stage: byStage,
      top_leads: topLeads,
      top_deals: topDeals,
      stuck_deals: stuck,
      active_threads: activeThreads,
      generated_at: new Date().toISOString(),
    }

    logAriaAction('pipeline-deep', null, 'ok')
    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    logAriaAction('pipeline-deep', null, 'error', msg)
    return NextResponse.json({ error: 'Pipeline-deep failed', details: msg }, { status: 500 })
  }
}
