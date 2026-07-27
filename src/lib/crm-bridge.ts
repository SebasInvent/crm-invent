import { createHmac, timingSafeEqual } from 'crypto'
import { getServiceRoleClient } from '@/lib/supabase'

export type SharedContact = {
  id: string
  first_name: string
  last_name?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  company_name?: string | null
  job_title?: string | null
  industry?: string | null
  country?: string | null
  type?: string | null
  status?: string | null
  tags?: string[] | null
  updated_at?: string | null
}

export function crmSystemId(): 'invent' | 'yumk' {
  return process.env.CRM_SYSTEM_ID === 'invent' ? 'invent' : 'yumk'
}

export function verifyBridgeSignature(rawBody: string, timestamp: string | null, signature: string | null) {
  const secret = process.env.CRM_BRIDGE_SECRET?.trim()
  if (!secret || !timestamp || !signature) return false

  const parsedTimestamp = Number(timestamp)
  if (!Number.isFinite(parsedTimestamp)) return false
  if (Math.abs(Date.now() - parsedTimestamp) > 5 * 60 * 1000) return false

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')
  if (expected.length !== signature.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export async function pushContactToPeer(contact: SharedContact, eventType: 'contact.created' | 'contact.updated' = 'contact.updated') {
  const baseUrl = process.env.CRM_BRIDGE_URL?.trim().replace(/\/$/, '')
  const secret = process.env.CRM_BRIDGE_SECRET?.trim()
  if (!baseUrl || !secret) return { ok: false, skipped: true as const }

  const payload = {
    event_id: crypto.randomUUID(),
    event_type: eventType,
    source_system: crmSystemId(),
    occurred_at: new Date().toISOString(),
    contact: {
      id: contact.id,
      first_name: contact.first_name,
      last_name: contact.last_name ?? null,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      mobile: contact.mobile ?? null,
      company_name: contact.company_name ?? null,
      job_title: contact.job_title ?? null,
      industry: contact.industry ?? null,
      country: contact.country ?? null,
      type: contact.type ?? 'lead',
      status: contact.status ?? 'active',
      tags: contact.tags ?? [],
      updated_at: contact.updated_at ?? new Date().toISOString(),
    },
  }
  const rawBody = JSON.stringify(payload)
  const timestamp = String(Date.now())
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')
  const supabase = getServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: event } = await (supabase.from('integration_sync_events') as any)
    .insert({
      event_id: payload.event_id,
      direction: 'outbound',
      peer_system: crmSystemId() === 'yumk' ? 'invent' : 'yumk',
      event_type: payload.event_type,
      entity_type: 'contact',
      entity_id: contact.id,
      payload,
      status: 'pending',
    })
    .select('id')
    .maybeSingle()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const response = await fetch(`${baseUrl}/api/integrations/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CRM-Timestamp': timestamp,
        'X-CRM-Signature': signature,
      },
      body: rawBody,
      signal: controller.signal,
    })
    const responseBody = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(responseBody.error || `Bridge HTTP ${response.status}`)

    if (event?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('integration_sync_events') as any)
        .update({ status: 'delivered', delivered_at: new Date().toISOString(), attempt_count: 1 })
        .eq('id', event.id)
    }
    return { ok: true, response: responseBody }
  } catch (error) {
    if (event?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('integration_sync_events') as any)
        .update({
          status: 'failed',
          attempt_count: 1,
          last_error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown bridge error',
        })
        .eq('id', event.id)
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown bridge error' }
  } finally {
    clearTimeout(timeout)
  }
}
