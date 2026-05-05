import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getServiceRoleClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'

// ─── Validation schemas ────────────────────────────────────────────────────

const leadCreateSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  source_platform: z.string().max(100).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  budget_level: z.enum(['low', 'medium', 'high']).optional().nullable(),
  authority_level: z.enum(['user', 'influencer', 'decision_maker']).optional().nullable(),
  need_urgency: z.enum(['low', 'medium', 'high', 'critical']).optional().nullable(),
  timeline: z.enum(['immediate', 'short_term', 'medium_term', 'long_term']).optional().nullable(),
  jung_archetype: z.string().max(100).optional().nullable(),
  priority: z.string().max(50).optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
})

const leadUpdateSchema = leadCreateSchema.partial().extend({
  id: z.string().uuid(),
  lead_score: z.number().int().min(0).max(100).optional(),
  lead_status: z.enum(['new', 'hot', 'warm', 'cold', 'qualified', 'converted', 'lost']).optional(),
})

const leadDeleteSchema = z.object({ id: z.string().uuid() })

const querySchema = z.object({
  status: z.string().nullable(),
  archetype: z.string().nullable(),
  priority: z.string().nullable(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
})

// ─── GET — list leads (auth required) ──────────────────────────────────────

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const params = querySchema.safeParse({
      status: searchParams.get('status'),
      archetype: searchParams.get('archetype'),
      priority: searchParams.get('priority'),
      limit: searchParams.get('limit'),
    })
    if (!params.success) {
      return NextResponse.json({ error: 'Invalid params', details: params.error.flatten() }, { status: 400 })
    }
    const { status, archetype, priority, limit } = params.data

    const supabase = getServiceRoleClient()
    let query = supabase
      .from('leads')
      .select('*')
      .order('lead_score', { ascending: false })
      .limit(limit)

    if (status) query = query.eq('lead_status', status)
    if (archetype) query = query.eq('jung_archetype', archetype)
    if (priority) query = query.eq('priority', priority)

    const { data: leads, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ leads })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── POST — create lead (auth required) ────────────────────────────────────

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const parsed = leadCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const leadScore = calculateLeadScore(parsed.data)
    const leadData = {
      ...parsed.data,
      lead_score: leadScore,
      lead_status: getLeadStatusFromScore(leadScore),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: auth.user.id,
    }

    const { data: lead, error } = await supabase
      .from('leads')
      .insert(leadData as never)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ lead }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── PUT — update lead (auth required) ─────────────────────────────────────

export async function PUT(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const parsed = leadUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const { id, ...updates } = parsed.data
    const supabase = getServiceRoleClient()

    if (
      updates.budget_level !== undefined ||
      updates.authority_level !== undefined ||
      updates.need_urgency !== undefined ||
      updates.timeline !== undefined
    ) {
      const score = calculateLeadScore(updates)
      updates.lead_score = score
      updates.lead_status = getLeadStatusFromScore(score)
    }

    const { data: lead, error } = await supabase
      .from('leads')
      .update({ ...updates, updated_at: new Date().toISOString() } as never)
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ lead })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE — delete lead (auth required) ──────────────────────────────────

export async function DELETE(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const parsed = leadDeleteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { error } = await supabase.from('leads').delete().eq('id', parsed.data.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── Lead scoring (unchanged logic, properly typed) ────────────────────────

type LeadInput = z.infer<typeof leadCreateSchema> | Partial<z.infer<typeof leadUpdateSchema>>

function calculateLeadScore(lead: LeadInput): number {
  let score = 0

  if (lead.budget_level === 'high') score += 40
  else if (lead.budget_level === 'medium') score += 25
  else if (lead.budget_level === 'low') score += 10

  if (lead.authority_level === 'decision_maker') score += 30
  else if (lead.authority_level === 'influencer') score += 20
  else if (lead.authority_level === 'user') score += 5

  if (lead.need_urgency === 'critical') score += 20
  else if (lead.need_urgency === 'high') score += 15
  else if (lead.need_urgency === 'medium') score += 10
  else if (lead.need_urgency === 'low') score += 5

  if (lead.timeline === 'immediate') score += 10
  else if (lead.timeline === 'short_term') score += 7
  else if (lead.timeline === 'medium_term') score += 5
  else if (lead.timeline === 'long_term') score += 2

  return Math.min(score, 100)
}

function getLeadStatusFromScore(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 80) return 'hot'
  if (score >= 50) return 'warm'
  return 'cold'
}
