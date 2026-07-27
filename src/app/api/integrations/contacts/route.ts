import { NextResponse } from 'next/server'
import { z } from 'zod'
import { crmSystemId, verifyBridgeSignature } from '@/lib/crm-bridge'
import { getServiceRoleClient } from '@/lib/supabase'
import { rateLimitOrBlock } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const eventSchema = z.object({
  event_id: z.string().uuid(),
  event_type: z.enum(['contact.created', 'contact.updated']),
  source_system: z.enum(['invent', 'yumk']),
  occurred_at: z.string().datetime(),
  contact: z.object({
    id: z.string().uuid(),
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().max(100).nullable().optional(),
    email: z.string().trim().email().max(200).nullable().optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    mobile: z.string().trim().max(50).nullable().optional(),
    company_name: z.string().trim().max(200).nullable().optional(),
    job_title: z.string().trim().max(200).nullable().optional(),
    industry: z.string().trim().max(100).nullable().optional(),
    country: z.string().trim().max(100).nullable().optional(),
    type: z.enum(['lead', 'prospect', 'customer', 'partner', 'supplier', 'vendor', 'influencer', 'employee']).nullable().optional(),
    status: z.enum(['active', 'inactive', 'archived', 'blocked']).nullable().optional(),
    tags: z.array(z.string().max(50)).max(50).nullable().optional(),
    updated_at: z.string().datetime().nullable().optional(),
  }),
})

function normalizedPhone(value?: string | null) {
  const digits = value?.replace(/\D/g, '') ?? ''
  return digits.length >= 7 ? digits : null
}

export async function GET() {
  return NextResponse.json({ ok: true, system: crmSystemId(), bridge: 'contacts-v1' })
}

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 120, key: 'crm-bridge-contacts' })
  if (block) return block

  const rawBody = await request.text()
  if (!verifyBridgeSignature(
    rawBody,
    request.headers.get('x-crm-timestamp'),
    request.headers.get('x-crm-signature'),
  )) {
    return NextResponse.json({ error: 'Invalid bridge signature' }, { status: 401 })
  }

  const parsed = eventSchema.safeParse(JSON.parse(rawBody))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid bridge event', details: parsed.error.flatten() }, { status: 400 })
  }
  const event = parsed.data
  if (event.source_system === crmSystemId()) {
    return NextResponse.json({ error: 'Source system cannot equal destination' }, { status: 409 })
  }

  const supabase = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: duplicate } = await (supabase.from('integration_sync_events') as any)
    .select('id, entity_id')
    .eq('event_id', event.event_id)
    .maybeSingle()
  if (duplicate) return NextResponse.json({ ok: true, duplicate: true, contact_id: duplicate.entity_id })

  const orgSlug = process.env.CRM_ORG_SLUG?.trim() || crmSystemId()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase.from('organizations') as any)
    .select('id')
    .eq('slug', orgSlug)
    .maybeSingle()
  if (!org?.id) return NextResponse.json({ error: 'Destination organization is not configured' }, { status: 503 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: link } = await (supabase.from('integration_contact_links') as any)
    .select('local_contact_id')
    .eq('peer_system', event.source_system)
    .eq('peer_contact_id', event.contact.id)
    .maybeSingle()

  let localContactId: string | null = link?.local_contact_id ?? null
  if (!localContactId && event.contact.email) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('contacts') as any)
      .select('id')
      .eq('org_id', org.id)
      .ilike('email', event.contact.email)
      .limit(1)
      .maybeSingle()
    localContactId = data?.id ?? null
  }
  const phone = normalizedPhone(event.contact.phone || event.contact.mobile)
  if (!localContactId && phone) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('contacts') as any)
      .select('id, phone, mobile')
      .eq('org_id', org.id)
      .or(`phone.ilike.%${phone.slice(-10)},mobile.ilike.%${phone.slice(-10)}`)
      .limit(1)
      .maybeSingle()
    localContactId = data?.id ?? null
  }

  const now = new Date().toISOString()
  const tags = Array.from(new Set([...(event.contact.tags ?? []), `shared:${event.source_system}`]))
  const contactPayload = {
    first_name: event.contact.first_name,
    last_name: event.contact.last_name ?? null,
    email: event.contact.email?.toLowerCase() ?? null,
    phone: event.contact.phone ?? null,
    mobile: event.contact.mobile ?? null,
    company_name: event.contact.company_name ?? null,
    job_title: event.contact.job_title ?? null,
    industry: event.contact.industry ?? null,
    country: event.contact.country ?? null,
    type: event.contact.type ?? 'lead',
    status: event.contact.status ?? 'active',
    tags,
    source: 'integration',
    source_details: { peer_system: event.source_system, peer_contact_id: event.contact.id },
    org_id: org.id,
    updated_at: now,
  }

  const result = localContactId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (supabase.from('contacts') as any).update(contactPayload).eq('id', localContactId).eq('org_id', org.id).select('id').single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : await (supabase.from('contacts') as any).insert({ ...contactPayload, created_at: now }).select('id').single()
  if (result.error || !result.data?.id) {
    return NextResponse.json({ error: result.error?.message || 'Could not sync contact' }, { status: 500 })
  }
  localContactId = result.data.id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('integration_contact_links') as any).upsert({
    local_contact_id: localContactId,
    peer_system: event.source_system,
    peer_contact_id: event.contact.id,
    last_synced_at: now,
    updated_at: now,
  }, { onConflict: 'peer_system,peer_contact_id' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('integration_sync_events') as any).insert({
    event_id: event.event_id,
    direction: 'inbound',
    peer_system: event.source_system,
    event_type: event.event_type,
    entity_type: 'contact',
    entity_id: localContactId,
    payload: event,
    status: 'delivered',
    delivered_at: now,
    attempt_count: 1,
  })

  return NextResponse.json({ ok: true, contact_id: localContactId }, { status: 201 })
}
