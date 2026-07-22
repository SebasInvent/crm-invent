import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAriaAuth, logAriaAction } from '@/lib/aria-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'
import { recordActivity } from '@/lib/activity-log'
import { notifyQualifiedLead } from '@/lib/lead-qualification'

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  lead_status: z.enum(['hot', 'warm', 'cold', 'qualified', 'dead', 'converted']).optional().default('warm'),
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
const statusRank = { cold: 0, warm: 1, hot: 2, qualified: 3, dead: -1, converted: 4 } as const

function metadataNote(parsed: z.infer<typeof bodySchema>) {
  const metadata = {
    source_url: parsed.source_url ?? null,
    website: parsed.website ?? null,
    communication_channel: parsed.communication_channel ?? null,
    consent_status: parsed.consent_status ?? null,
    next_follow_up_date: parsed.next_follow_up_date ?? null,
    scraped_data: parsed.scraped_data ?? null,
  }
  const hasMetadata = Object.values(metadata).some((value) => value !== null)
  return [parsed.notes, hasMetadata ? `[METADATA_N8N] ${JSON.stringify(metadata)}` : null]
    .filter(Boolean)
    .join('\n\n')
    .slice(-5000)
}

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'aria-lead-create' })
  if (block) return block

  const auth = requireAriaAuth(request)
  if (auth.error) return auth.error

  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
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

    type ExistingLead = {
      id: string
      name: string
      email: string | null
      phone: string | null
      lead_status: 'hot' | 'warm' | 'cold' | 'qualified' | 'dead' | 'converted'
      lead_score: number | null
      priority: 'critical' | 'high' | 'medium' | 'low' | null
      notes: string | null
      product_id: string | null
      tags: string[] | null
    }

    let existing: ExistingLead | null = null
    const selectExisting = 'id, name, email, phone, lead_status, lead_score, priority, notes, product_id, tags'
    if (parsed.phone) {
      const { data } = await supabase.from('leads').select(selectExisting).eq('phone', parsed.phone).limit(1)
      existing = ((data ?? [])[0] as ExistingLead | undefined) ?? null
    }
    if (!existing && parsed.email) {
      const { data } = await supabase.from('leads').select(selectExisting).ilike('email', parsed.email).limit(1)
      existing = ((data ?? [])[0] as ExistingLead | undefined) ?? null
    }
    if (!existing && !parsed.phone && !parsed.email) {
      let query = supabase.from('leads').select(selectExisting).ilike('name', parsed.name)
      if (parsed.company) query = query.ilike('company', parsed.company)
      const { data } = await query.limit(1)
      existing = ((data ?? [])[0] as ExistingLead | undefined) ?? null
    }

    const incomingNotes = metadataNote(parsed)
    if (existing) {
      const currentStatus = existing.lead_status ?? 'cold'
      const protectedStatus = currentStatus === 'dead' || currentStatus === 'converted'
      const nextStatus = protectedStatus
        ? currentStatus
        : statusRank[parsed.lead_status] > statusRank[currentStatus]
          ? parsed.lead_status
          : currentStatus
      const currentPriority = existing.priority ?? 'low'
      const nextPriority = priorityRank[parsed.priority] > priorityRank[currentPriority]
        ? parsed.priority
        : currentPriority
      const nextNotes = incomingNotes && !String(existing.notes ?? '').includes(incomingNotes)
        ? [existing.notes, `[${new Date().toISOString()}] ${incomingNotes}`].filter(Boolean).join('\n\n').slice(-5000)
        : existing.notes

      const update = {
        name: parsed.name,
        email: parsed.email ?? existing.email,
        phone: parsed.phone ?? existing.phone,
        company: parsed.company,
        industry: parsed.industry,
        location: parsed.location,
        source: parsed.source,
        source_platform: parsed.source_platform,
        lead_status: nextStatus,
        lead_score: Math.max(Number(existing.lead_score) || 0, parsed.lead_score),
        priority: nextPriority,
        notes: nextNotes,
        tags: Array.from(new Set([...(existing.tags ?? []), ...parsed.tags])).slice(0, 30),
        product_id: existing.product_id ?? productId,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await (supabase.from('leads') as any)
        .update(update)
        .eq('id', existing.id)
        .select('id, name, email, phone, company, location, lead_status, lead_score, priority, product_id, tags, notes, updated_at')
        .single()
      if (error) throw new Error(error.message)

      recordActivity(supabase, {
        lead_id: existing.id,
        activity_type: 'note',
        title: `Lead deduplicado y enriquecido por Aria: ${parsed.name}`,
        description: parsed.notes ?? null,
        metadata: { source: 'aria', deduplicated: true, product_slug: parsed.product_slug ?? null },
      })
      const qualification = data?.lead_status === 'qualified'
        ? await notifyQualifiedLead(supabase, data, 'agent')
        : null
      logAriaAction('leads.create', { ...parsed, deduplicated_id: existing.id }, 'ok')
      return NextResponse.json({
        ok: true,
        created: false,
        deduplicated: true,
        lead: { ...data, next_follow_up_date: parsed.next_follow_up_date ?? null },
        qualification,
        message: `Lead existente enriquecido: ${data?.name ?? parsed.name}`,
      })
    }

    const fallbackEmail = `sin-email+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@inventagency.co`
    const insertPayload = {
      name: parsed.name,
      email: parsed.email ?? fallbackEmail,
      phone: parsed.phone,
      company: parsed.company,
      industry: parsed.industry,
      lead_status: parsed.lead_status,
      lead_score: parsed.lead_score,
      priority: parsed.priority,
      source: parsed.source,
      source_platform: parsed.source_platform,
      location: parsed.location,
      tags: parsed.tags,
      notes: incomingNotes,
      product_id: productId,
    }
    const { data, error } = await (supabase.from('leads') as any)
      .insert(insertPayload)
      .select('id, name, email, phone, company, location, lead_status, lead_score, priority, product_id, tags, notes, created_at, updated_at')
      .single()
    if (error) throw new Error(error.message)

    if (data?.id) {
      recordActivity(supabase, {
        lead_id: data.id,
        activity_type: 'lead_created',
        title: `Lead creado por Aria: ${parsed.name}`,
        description: parsed.notes ?? null,
        metadata: { source: 'aria', status: parsed.lead_status, product_slug: parsed.product_slug ?? null },
      })
    }
    const qualification = data?.lead_status === 'qualified'
      ? await notifyQualifiedLead(supabase, data, 'agent')
      : null
    logAriaAction('leads.create', parsed, 'ok')
    return NextResponse.json({
      ok: true,
      created: true,
      deduplicated: false,
      lead: { ...data, next_follow_up_date: parsed.next_follow_up_date ?? null },
      qualification,
      message: `Lead creado: ${parsed.name} (${parsed.lead_status})`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    logAriaAction('leads.create', parsed, 'error', msg)
    return NextResponse.json({ error: 'Create failed', details: msg }, { status: 500 })
  }
}
