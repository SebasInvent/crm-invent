import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getServiceRoleClient } from '@/lib/supabase'
import { rateLimitOrBlock } from '@/lib/rate-limit'

const KNOWN_ORIGINS = new Set([
  'https://yumkgroup.vercel.app',
  'https://yumk-technology-studio.inventagency.chatgpt.site',
  'http://localhost:3000',
  'http://localhost:5173',
])

const diagnosticSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(220).transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(50).optional().nullable(),
  company: z.string().trim().max(180).optional().nullable(),
  market: z.enum(['US', 'CO', 'INTL']),
  language: z.enum(['en', 'es']).default('en'),
  answers: z.array(z.string().trim().min(1).max(240)).length(6),
  recommendation: z.object({
    program: z.enum([
      'Digital Foundation',
      'Digital Commerce',
      'Business Automation',
      'SaaS Launch',
      'Custom Technology',
    ]),
    complexity: z.enum(['Focused', 'Moderate', 'Advanced']),
    range: z.string().trim().min(3).max(80),
    timeline: z.string().trim().min(3).max(80),
  }),
  source_url: z.string().url().max(800).optional().nullable(),
  referrer: z.string().max(800).optional().nullable(),
  utm: z.record(z.string().max(300)).optional().default({}),
  consent: z.literal(true),
  // Honeypot. Humans never see or fill it.
  fax_number: z.string().max(0).optional().default(''),
})

type Diagnostic = z.infer<typeof diagnosticSchema>

function configuredOrigins() {
  const extra = (process.env.YUMK_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return new Set([...KNOWN_ORIGINS, ...extra])
}

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
  if (origin && configuredOrigins().has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

function originAllowed(request: Request) {
  const origin = request.headers.get('origin')
  return Boolean(origin && configuredOrigins().has(origin))
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/)
  return {
    firstName: parts.shift() || name,
    lastName: parts.join(' ') || null,
  }
}

function leadQualification(data: Diagnostic) {
  const [context, priority, users, surface, investment, timing] = data.answers

  const budget = investment.includes('$120k')
    ? { points: 40, level: 'high' as const, value: 120_000 }
    : investment.includes('$60k')
      ? { points: 35, level: 'high' as const, value: 60_000 }
      : investment.includes('$30k')
        ? { points: 25, level: 'medium' as const, value: 30_000 }
        : { points: 15, level: 'low' as const, value: 15_000 }

  const urgency = timing.includes('8–12')
    ? { points: 20, level: 'critical' as const, timeline: 'immediate' as const }
    : timing.includes('3–6')
      ? { points: 15, level: 'high' as const, timeline: 'short_term' as const }
      : timing.includes('6–12')
        ? { points: 10, level: 'medium' as const, timeline: 'medium_term' as const }
        : { points: 5, level: 'low' as const, timeline: 'long_term' as const }

  const contextPoints = context.includes('established') ? 15 : context.includes('service') ? 13 : 10
  const solutionFit = priority.includes('digital product') || priority.includes('Automate') ? 15 : 12
  const complexityFit = users.includes('Multiple') || users.includes('marketplace') || surface.includes('mobile') ? 10 : 7
  const completeness = data.phone || data.company ? 5 : 2
  const score = Math.min(100, budget.points + urgency.points + contextPoints + solutionFit + complexityFit + completeness)

  return {
    score,
    budgetLevel: budget.level,
    needUrgency: urgency.level,
    timeline: urgency.timeline,
    opportunityValue: budget.value,
    status: score >= 80 ? 'hot' : score >= 50 ? 'warm' : 'cold',
    priority: score >= 80 ? 'critical' : score >= 65 ? 'high' : score >= 50 ? 'medium' : 'low',
    classification:
      score >= 85 ? 'Ready for Strategy Session'
      : score >= 75 ? 'Priority Lead'
      : score >= 65 ? 'High-Potential Lead'
      : score >= 50 ? 'Qualified Lead'
      : 'Exploratory Lead',
  }
}

function programSlug(program: Diagnostic['recommendation']['program']) {
  return {
    'Digital Foundation': 'yumk-digital-foundation',
    'Digital Commerce': 'yumk-digital-commerce',
    'Business Automation': 'yumk-business-automation',
    'SaaS Launch': 'yumk-saas-launch',
    'Custom Technology': 'yumk-custom-technology',
  }[program]
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin')
  if (!originAllowed(request)) {
    return new NextResponse(null, { status: 403, headers: corsHeaders(origin) })
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const headers = corsHeaders(origin)
  if (!originAllowed(request)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403, headers })
  }

  const block = rateLimitOrBlock(request, { window: '15m', max: 8, key: 'yumk-diagnostic' })
  if (block) {
    Object.entries(headers).forEach(([key, value]) => block.headers.set(key, value))
    return block
  }

  const parsed = diagnosticSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid diagnostic', details: parsed.error.flatten() },
      { status: 400, headers },
    )
  }
  const input = parsed.data
  const qualification = leadQualification(input)
  const supabase = getServiceRoleClient()

  // Resolve the entire commercial path from canonical CRM configuration.
  const { data: org } = await (supabase.from('organizations') as any)
    .select('id')
    .eq('slug', 'yumk')
    .maybeSingle()
  if (!org?.id) {
    return NextResponse.json({ error: 'Yumk workspace is not configured' }, { status: 503, headers })
  }

  const { data: networkConnections } = await (supabase.from('organization_connections') as any)
    .select('connected_org_id')
    .eq('org_id', org.id)
    .eq('status', 'active')
    .eq('share_contacts', true)
  const contactOrgIds = Array.from(new Set([
    org.id,
    ...(((networkConnections as Array<{ connected_org_id: string }> | null) ?? [])
      .map((connection) => connection.connected_org_id)),
  ]))

  const entityCode = input.market === 'CO' ? 'CO' : 'US'
  const { data: entity } = await (supabase.from('operating_entities') as any)
    .select('id, currency')
    .eq('org_id', org.id)
    .eq('code', entityCode)
    .maybeSingle()

  const { data: product } = await (supabase.from('products') as any)
    .select('id')
    .eq('slug', programSlug(input.recommendation.program))
    .maybeSingle()

  const { data: pipeline } = product?.id
    ? await (supabase.from('pipelines') as any)
        .select('id')
        .eq('org_id', org.id)
        .eq('product_id', product.id)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  const { data: initialStage } = pipeline?.id
    ? await (supabase.from('pipeline_stages') as any)
        .select('id, default_probability')
        .eq('org_id', org.id)
        .eq('pipeline_id', pipeline.id)
        .eq('is_active', true)
        .order('order_index', { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null }

  const now = new Date().toISOString()
  const { firstName, lastName } = splitName(input.name)
  const country = input.market === 'CO' ? 'Colombia' : input.market === 'US' ? 'United States' : 'International'
  const sourceDetails = {
    channel: 'yumkgroup.vercel.app',
    diagnostic: true,
    market: input.market,
    program: input.recommendation.program,
    classification: qualification.classification,
  }

  const { data: existingContact } = await (supabase.from('contacts') as any)
    .select('id, org_id, first_name, last_name, type, status, phone, company_name, lead_score, priority, tags, source_details')
    .in('org_id', contactOrgIds)
    .ilike('email', input.email)
    .limit(1)
    .maybeSingle()

  const newContactPayload = {
    first_name: firstName,
    last_name: lastName,
    email: input.email,
    phone: input.phone || null,
    company_name: input.company || null,
    country,
    type: 'lead',
    status: 'active',
    source: 'web_form',
    source_details: sourceDetails,
    lead_score: qualification.score,
    priority: qualification.priority,
    consent_status: 'granted',
    consent_date: now,
    product_id: product?.id ?? null,
    operating_entity_id: entity?.id ?? null,
    org_id: org.id,
    tags: ['yumk', 'website-diagnostic', input.market.toLowerCase()],
    updated_at: now,
  }

  const priorityOrder = { low: 1, medium: 2, high: 3, critical: 4 } as const
  const existingPriority = existingContact?.priority as keyof typeof priorityOrder | undefined
  const strongestPriority = existingPriority && priorityOrder[existingPriority] > priorityOrder[qualification.priority]
    ? existingPriority
    : qualification.priority

  // Si el contacto nació en Invent no se reasigna a Yumk: se enriquece la
  // misma ficha maestra y la oportunidad nueva conserva org_id = Yumk.
  const sharedContactUpdate = existingContact?.id ? {
    first_name: existingContact.first_name || firstName,
    last_name: existingContact.last_name || lastName,
    email: input.email,
    phone: input.phone || existingContact.phone || null,
    company_name: input.company || existingContact.company_name || null,
    country,
    lead_score: Math.max(Number(existingContact.lead_score ?? 0), qualification.score),
    priority: strongestPriority,
    consent_status: 'granted',
    consent_date: now,
    tags: Array.from(new Set([
      ...((existingContact.tags as string[] | null) ?? []),
      'yumk',
      'website-diagnostic',
      input.market.toLowerCase(),
    ])),
    source_details: {
      ...((existingContact.source_details as Record<string, unknown> | null) ?? {}),
      last_yumk_diagnostic: sourceDetails,
    },
    updated_at: now,
  } : null

  const contactResult = existingContact?.id && sharedContactUpdate
    ? await (supabase.from('contacts') as any)
        .update(sharedContactUpdate)
        .eq('id', existingContact.id)
        .select('id')
        .single()
    : await (supabase.from('contacts') as any)
        .insert({ ...newContactPayload, created_at: now })
        .select('id')
        .single()

  if (contactResult.error || !contactResult.data?.id) {
    return NextResponse.json({ error: 'Could not create CRM contact' }, { status: 500, headers })
  }
  const contactId = contactResult.data.id

  const { data: existingLead } = await (supabase.from('leads') as any)
    .select('id')
    .eq('org_id', org.id)
    .ilike('email', input.email)
    .limit(1)
    .maybeSingle()

  const leadPayload = {
    name: input.name,
    email: input.email,
    phone: input.phone || null,
    company: input.company || null,
    source: 'web_form',
    source_platform: 'website',
    budget_level: qualification.budgetLevel,
    need_urgency: qualification.needUrgency,
    timeline: qualification.timeline,
    lead_score: qualification.score,
    lead_status: qualification.status,
    priority: qualification.priority,
    location: country,
    consent_status: 'granted',
    consent_date: now,
    product_id: product?.id ?? null,
    operating_entity_id: entity?.id ?? null,
    org_id: org.id,
    tags: ['yumk', 'website-diagnostic', input.market.toLowerCase()],
    scraped_data: {
      answers: input.answers,
      recommendation: input.recommendation,
      qualification: { score: qualification.score, classification: qualification.classification },
      source_url: input.source_url,
      referrer: input.referrer,
      utm: input.utm,
    },
    notes: `Diagnóstico Yumk: ${qualification.classification}. Programa recomendado: ${input.recommendation.program}.`,
    updated_at: now,
  }

  const leadResult = existingLead?.id
    ? await (supabase.from('leads') as any)
        .update(leadPayload)
        .eq('id', existingLead.id)
        .eq('org_id', org.id)
        .select('id')
        .single()
    : await (supabase.from('leads') as any)
        .insert({ ...leadPayload, created_at: now })
        .select('id')
        .single()

  if (leadResult.error || !leadResult.data?.id) {
    return NextResponse.json({ error: 'Could not create CRM lead' }, { status: 500, headers })
  }
  const leadId = leadResult.data.id

  let dealId: string | null = null
  if (product?.id && pipeline?.id && initialStage?.id) {
    const { data: existingDeal } = await (supabase.from('deals') as any)
      .select('id')
      .eq('org_id', org.id)
      .eq('contact_id', contactId)
      .eq('product_id', product.id)
      .eq('status', 'open')
      .limit(1)
      .maybeSingle()

    if (existingDeal?.id) {
      dealId = existingDeal.id
      await (supabase.from('deals') as any)
        .update({
          value: qualification.opportunityValue,
          // The public diagnostic ranges are denominated in USD. Colombia can
          // quote/invoice in COP later without corrupting the initial estimate.
          currency: 'USD',
          probability: initialStage.default_probability ?? 10,
          operating_entity_id: entity?.id ?? null,
          custom_fields: sourceDetails,
          updated_at: now,
        })
        .eq('id', dealId)
        .eq('org_id', org.id)
    } else {
      const { data: deal } = await (supabase.from('deals') as any)
        .insert({
          org_id: org.id,
          contact_id: contactId,
          name: `${input.company || input.name} — ${input.recommendation.program}`,
          description: `Oportunidad creada desde el diagnóstico público. ${qualification.classification}.`,
          pipeline_id: pipeline.id,
          stage_id: initialStage.id,
          product_id: product.id,
          operating_entity_id: entity?.id ?? null,
          value: qualification.opportunityValue,
          currency: 'USD',
          probability: initialStage.default_probability ?? 10,
          status: 'open',
          source: 'yumk_website',
          tags: ['yumk', 'diagnostic', input.market.toLowerCase()],
          custom_fields: sourceDetails,
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single()
      dealId = deal?.id ?? null
    }
  }

  const { data: submission, error: submissionError } = await (supabase.from('diagnostic_submissions') as any)
    .insert({
      org_id: org.id,
      operating_entity_id: entity?.id ?? null,
      contact_id: contactId,
      lead_id: leadId,
      deal_id: dealId,
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      company: input.company || null,
      market: input.market,
      language: input.language,
      answers: input.answers,
      recommended_program: input.recommendation.program,
      complexity: input.recommendation.complexity,
      indicative_range: input.recommendation.range,
      indicative_timeline: input.recommendation.timeline,
      lead_score: qualification.score,
      classification: qualification.classification,
      consent_status: 'granted',
      source_url: input.source_url || null,
      referrer: input.referrer || null,
      utm: input.utm,
      status: 'new',
    })
    .select('id')
    .single()

  if (submissionError || !submission?.id) {
    return NextResponse.json({ error: 'Could not save diagnostic brief' }, { status: 500, headers })
  }

  return NextResponse.json(
    {
      ok: true,
      submission_id: submission.id,
      qualification: {
        score: qualification.score,
        classification: qualification.classification,
        priority: qualification.priority,
      },
      next_step: qualification.score >= 65 ? 'strategy_session' : 'review',
    },
    { status: 201, headers },
  )
}
