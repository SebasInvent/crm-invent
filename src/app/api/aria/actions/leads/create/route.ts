import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAriaAuth, logAriaAction } from '@/lib/aria-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'
import { recordActivity } from '@/lib/activity-log'

/**
 * POST /api/aria/actions/leads/create
 *
 * Create a new lead. Aria uses this when scraping social signals or
 * during a chat with the user where a new prospect emerges.
 */

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  jung_archetype: z
    .enum([
      'hero_entrepreneur',
      'sage_conservative',
      'caregiver_stressed',
      'artist_specialist',
      'ruler_executive',
      'explorer_merchant',
    ])
    .optional()
    .nullable(),
  lead_status: z.enum(['hot', 'warm', 'cold', 'dead', 'converted']).optional().default('warm'),
  lead_score: z.number().int().min(0).max(100).optional().default(50),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional().default('medium'),
  product_slug: z.string().max(80).optional(),
  source: z
    .enum(['scraped', 'web_form', 'referral', 'linkedin', 'event', 'cold_outreach', 'telegram', 'openclaw', 'other'])
    .optional()
    .default('scraped'),
  source_url: z.string().url().max(1000).optional().nullable(),
  source_platform: z
    .enum(['linkedin', 'instagram', 'google_business', 'mercado_libre', 'rappi', 'website', 'google_maps', 'directory'])
    .optional()
    .nullable(),
  location: z.string().max(200).optional().nullable(),
  website: z.string().url().max(1000).optional().nullable(),
  scraped_data: z.record(z.unknown()).optional().nullable(),
  communication_channel: z.enum(['email', 'linkedin', 'whatsapp', 'phone']).optional().nullable(),
  consent_status: z.enum(['granted', 'pending', 'denied']).optional().nullable(),
  tags: z.array(z.string().max(80)).max(30).optional().default([]),
  next_follow_up_date: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
})

const priorityRank = { low: 0, medium: 1, high: 2, critical: 3 } as const
const statusRank = { cold: 0, warm: 1, hot: 2, dead: -1, converted: 3 } as const

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'aria-lead-create' })
  if (block) return block

  const auth = requireAriaAuth(request)
  if (auth.error) return auth.error

  let parsed: z.infer<typeof bodySchema>
  try {
    const body = await request.json()
    parsed = bodySchema.parse(body)
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  try {
    const { product_slug: productSlug, ...leadFields } = parsed
    let productId: string | null = null
    if (productSlug) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('id')
        .eq('slug', productSlug)
        .maybeSingle()
      if (productError) throw new Error(productError.message)
      if (!product) {
        return NextResponse.json({ error: `Producto '${productSlug}' no existe` }, { status: 404 })
      }
      productId = (product as { id: string }).id
    }

    type ExistingLead = {
      id: string
      name: string
      email: string | null
      phone: string | null
      lead_status: 'hot' | 'warm' | 'cold' | 'dead' | 'converted'
      lead_score: number | null
      priority: 'critical' | 'high' | 'medium' | 'low' | null
      next_follow_up_date: string | null
      notes: string | null
      product_id: string | null
      tags: string[] | null
      consent_status: 'granted' | 'pending' | 'denied' | null
    }

    let existing: ExistingLead | null = null
    const selectExisting =
      'id, name, email, phone, lead_status, lead_score, priority, next_follow_up_date, notes, product_id, tags, consent_status'
    if (parsed.phone) {
      const { data } = await supabase
        .from('leads')
        .select(selectExisting)
        .eq('phone', parsed.phone)
        .limit(1)
      existing = ((data ?? [])[0] as ExistingLead | undefined) ?? null
    }
    if (!existing && parsed.email) {
      const { data } = await supabase
        .from('leads')
        .select(selectExisting)
        .ilike('email', parsed.email)
        .limit(1)
      existing = ((data ?? [])[0] as ExistingLead | undefined) ?? null
    }

    if (existing) {
      const currentStatus = existing.lead_status ?? 'cold'
      const requestedStatus = parsed.lead_status
      const protectedStatus = currentStatus === 'dead' || currentStatus === 'converted'
      const nextStatus = protectedStatus
        ? currentStatus
        : statusRank[requestedStatus] > statusRank[currentStatus]
          ? requestedStatus
          : currentStatus
      const currentPriority = existing.priority ?? 'low'
      const nextPriority = priorityRank[parsed.priority] > priorityRank[currentPriority]
        ? parsed.priority
        : currentPriority
      const nextNotes = parsed.notes && !String(existing.notes ?? '').includes(parsed.notes)
        ? [existing.notes, `[${new Date().toISOString()}] ${parsed.notes}`].filter(Boolean).join('\n\n').slice(-2000)
        : existing.notes
      const nextTags = Array.from(new Set([...(existing.tags ?? []), ...parsed.tags])).slice(0, 30)
      const nextConsent = existing.consent_status === 'denied'
        ? 'denied'
        : existing.consent_status === 'granted'
          ? 'granted'
          : parsed.consent_status ?? existing.consent_status

      const update = {
        ...leadFields,
        lead_status: nextStatus,
        lead_score: Math.max(Number(existing.lead_score) || 0, parsed.lead_score),
        priority: nextPriority,
        notes: nextNotes,
        tags: nextTags,
        consent_status: nextConsent,
        product_id: existing.product_id ?? productId,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await (supabase.from('leads') as any)
        .update(update)
        .eq('id', existing.id)
        .select('id, name, email, phone, lead_status, lead_score, priority, next_follow_up_date, product_id')
        .single()
      if (error) throw new Error(error.message)

      recordActivity(supabase, {
        lead_id: existing.id,
        activity_type: 'note',
        title: `Lead deduplicado y enriquecido por Aria: ${parsed.name}`,
        description: parsed.notes ?? null,
        metadata: { source: 'aria', deduplicated: true, product_slug: productSlug ?? null },
      })
      logAriaAction('leads.create', { ...parsed, deduplicated_id: existing.id }, 'ok')
      return NextResponse.json({
        ok: true,
        created: false,
        deduplicated: true,
        lead: data,
        message: `Lead existente enriquecido: ${data?.name ?? parsed.name}`,
      })
    }

    const insertPayload = { ...leadFields, product_id: productId }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('leads') as any)
      .insert(insertPayload)
      .select('id, name, email, phone, lead_status, lead_score, priority, next_follow_up_date, product_id')
      .single()

    if (error) throw new Error(error.message)

    // Audit trail — first event for this lead
    if (data?.id) {
      recordActivity(supabase, {
        lead_id: data.id,
        activity_type: 'lead_created',
        title: `Lead creado por Aria: ${parsed.name}`,
        description: parsed.notes ?? null,
        metadata: {
          source: 'aria',
          archetype: parsed.jung_archetype,
          status: parsed.lead_status,
          product_slug: productSlug ?? null,
        },
      })
    }

    logAriaAction('leads.create', parsed, 'ok')
    return NextResponse.json({
      ok: true,
      created: true,
      deduplicated: false,
      lead: data,
      message: `Lead creado: ${parsed.name} (${parsed.lead_status})`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    logAriaAction('leads.create', parsed, 'error', msg)
    return NextResponse.json({ error: 'Create failed', details: msg }, { status: 500 })
  }
}
