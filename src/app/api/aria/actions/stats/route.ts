import { NextResponse } from 'next/server'
import { requireAriaAuth, logAriaAction } from '@/lib/aria-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET /api/aria/actions/stats
 *
 * High-level CRM snapshot for Aria — used to answer "how's the
 * pipeline this month?" or "cuántos leads hot tengo".
 */

export async function GET(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'aria-stats' })
  if (block) return block

  const auth = requireAriaAuth(request)
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()

  try {
    // Run all counts in parallel — none depend on each other
    const [leadsRes, dealsRes, contactsRes, threadsRes] = await Promise.all([
      supabase.from('leads').select('lead_status, lead_score, next_follow_up_date'),
      supabase.from('deals_full').select('value, status, stage_id, probability'),
      supabase.from('contacts').select('type'),
      supabase.from('chat_threads').select('status, last_message_at').limit(500),
    ])

    const leads = (leadsRes.data || []) as Array<{ lead_status: string; lead_score: number; next_follow_up_date: string | null }>
    const deals = (dealsRes.data || []) as Array<{ value: number; status: string; stage_id: string; probability: number }>
    const contacts = (contactsRes.data || []) as Array<{ type: string }>
    const threads = (threadsRes.data || []) as Array<{ status: string; last_message_at: string }>

    // Leads by status
    const leadsByStatus = leads.reduce<Record<string, number>>((acc, l) => {
      acc[l.lead_status] = (acc[l.lead_status] || 0) + 1
      return acc
    }, {})

    // Leads needing follow-up in next 7 days
    const now = Date.now()
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    const followUpsThisWeek = leads.filter((l) => {
      if (!l.next_follow_up_date) return false
      const t = new Date(l.next_follow_up_date).getTime()
      return t >= now && t <= now + sevenDays
    }).length

    // Deals open + open value + weighted value
    const openDeals = deals.filter((d) => d.status === 'open')
    const totalOpenValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0)
    const weightedOpenValue = openDeals.reduce(
      (sum, d) => sum + ((d.value || 0) * (d.probability || 0)) / 100,
      0,
    )

    // Contacts by type
    const contactsByType = contacts.reduce<Record<string, number>>((acc, c) => {
      acc[c.type] = (acc[c.type] || 0) + 1
      return acc
    }, {})

    // Chat threads — active in last 7 days vs total
    const threadsActive = threads.filter(
      (t) => now - new Date(t.last_message_at).getTime() <= sevenDays,
    ).length

    const summary = {
      leads: {
        total: leads.length,
        by_status: leadsByStatus,
        follow_ups_next_7_days: followUpsThisWeek,
      },
      deals: {
        open_count: openDeals.length,
        open_value_total: Math.round(totalOpenValue),
        open_value_weighted: Math.round(weightedOpenValue),
      },
      contacts: {
        total: contacts.length,
        by_type: contactsByType,
      },
      chat_threads: {
        total: threads.length,
        active_last_7_days: threadsActive,
      },
      generated_at: new Date().toISOString(),
    }

    logAriaAction('stats', null, 'ok')
    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    logAriaAction('stats', null, 'error', msg)
    return NextResponse.json({ error: 'Stats failed', details: msg }, { status: 500 })
  }
}
