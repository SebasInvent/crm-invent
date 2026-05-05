import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET /api/timeline?contact_id=...&lead_id=...&limit=80
 *
 * Returns a unified, chronologically-sorted feed of events for a
 * single contact or lead. Aggregates from multiple tables:
 *
 *   - activity_logs    canonical CRM event log
 *   - chat_messages    WhatsApp / Telegram bot conversations
 *                      (joined via chat_threads.lead_id)
 *   - email_logs       outbound emails (joined via contact_id)
 *   - deals            created/updated timestamps for related deals
 *
 * Each event is normalized to:
 *   { id, type, source, timestamp, title, description, metadata }
 *
 * Sorted desc, capped at `limit` (default 80, max 200). Pure read,
 * uses service role to merge tables that may have different RLS
 * scoping — the user is already authenticated.
 */

const querySchema = z
  .object({
    contact_id: z.string().uuid().optional(),
    lead_id: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(80),
  })
  .refine((v) => v.contact_id || v.lead_id, {
    message: 'Either contact_id or lead_id is required',
  })

type TimelineEvent = {
  id: string
  type: string
  source: 'activity' | 'chat' | 'email' | 'deal'
  timestamp: string
  title: string
  description?: string | null
  metadata?: Record<string, unknown>
}

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const url = new URL(request.url)
  let parsed: z.infer<typeof querySchema>
  try {
    parsed = querySchema.parse({
      contact_id: url.searchParams.get('contact_id') || undefined,
      lead_id: url.searchParams.get('lead_id') || undefined,
      limit: url.searchParams.get('limit') ?? 80,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid query', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()
  const events: TimelineEvent[] = []

  try {
    // ─── 1. activity_logs (canonical CRM events)
    if (parsed.contact_id) {
      const { data } = await supabase
        .from('activity_logs')
        .select('id, activity_type, title, description, metadata, created_at')
        .eq('contact_id', parsed.contact_id)
        .order('created_at', { ascending: false })
        .limit(parsed.limit)
      ;(data || []).forEach((row: any) => {
        events.push({
          id: row.id,
          type: row.activity_type,
          source: 'activity',
          timestamp: row.created_at,
          title: row.title,
          description: row.description,
          metadata: row.metadata,
        })
      })
    }

    // ─── 2. chat_messages (joined via chat_threads.lead_id)
    if (parsed.lead_id) {
      // First grab thread ids belonging to this lead
      const { data: threads } = await supabase
        .from('chat_threads')
        .select('id, phone, contact_name')
        .eq('lead_id', parsed.lead_id)

      const threadIds = (threads || []).map((t: any) => t.id)
      if (threadIds.length > 0) {
        const { data: msgs } = await supabase
          .from('chat_messages')
          .select('id, thread_id, direction, sender, content, created_at')
          .in('thread_id', threadIds)
          .order('created_at', { ascending: false })
          .limit(parsed.limit)

        ;(msgs || []).forEach((m: any) => {
          const fromBot = m.sender === 'bot'
          const fromHuman = m.sender === 'human'
          const inbound = m.direction === 'inbound'
          events.push({
            id: m.id,
            type: 'whatsapp_message',
            source: 'chat',
            timestamp: m.created_at,
            title: inbound
              ? 'Mensaje recibido'
              : fromBot
                ? 'Bot respondió'
                : fromHuman
                  ? 'Tú respondiste'
                  : 'Mensaje enviado',
            description: m.content,
            metadata: { thread_id: m.thread_id, sender: m.sender, direction: m.direction },
          })
        })
      }
    }

    // ─── 3. email_logs
    if (parsed.contact_id) {
      const { data: emails } = await supabase
        .from('email_logs')
        .select('id, subject, body_preview, sent_at, status, recipient_email')
        .eq('contact_id', parsed.contact_id)
        .order('sent_at', { ascending: false })
        .limit(parsed.limit)
      ;(emails || []).forEach((e: any) => {
        events.push({
          id: e.id,
          type: 'email_sent',
          source: 'email',
          timestamp: e.sent_at,
          title: `Email: ${e.subject || '(sin asunto)'}`,
          description: e.body_preview ?? null,
          metadata: { recipient: e.recipient_email, status: e.status },
        })
      })
    }

    // ─── 4. deals tied to this contact
    if (parsed.contact_id) {
      const { data: deals } = await supabase
        .from('deals')
        .select('id, name, value, status, stage_id, created_at, updated_at')
        .eq('contact_id', parsed.contact_id)
        .order('updated_at', { ascending: false })
        .limit(parsed.limit)
      ;(deals || []).forEach((d: any) => {
        // Show "deal created" event if created_at is recent enough
        events.push({
          id: `deal-${d.id}-created`,
          type: 'deal_created',
          source: 'deal',
          timestamp: d.created_at,
          title: `Deal creado: ${d.name}`,
          description: `Valor estimado: $${(d.value ?? 0).toLocaleString()}`,
          metadata: { deal_id: d.id, status: d.status, stage_id: d.stage_id },
        })
        // If it's been updated more than ~5 minutes after creation, also
        // add an "updated" event so stage moves are visible
        if (
          d.updated_at &&
          new Date(d.updated_at).getTime() - new Date(d.created_at).getTime() > 5 * 60_000
        ) {
          events.push({
            id: `deal-${d.id}-updated`,
            type: 'deal_updated',
            source: 'deal',
            timestamp: d.updated_at,
            title: `Deal actualizado: ${d.name}`,
            description: null,
            metadata: { deal_id: d.id, status: d.status, stage_id: d.stage_id },
          })
        }
      })
    }

    // Sort + cap
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    const trimmed = events.slice(0, parsed.limit)

    return NextResponse.json({
      ok: true,
      count: trimmed.length,
      events: trimmed,
    })
  } catch (err) {
    console.error('Timeline error:', err)
    return NextResponse.json(
      { error: 'Timeline failed', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
