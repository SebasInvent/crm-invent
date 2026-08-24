import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAriaAuth, logAriaAction } from '@/lib/aria-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

const eventSchema = z.object({
  phone: z.string().min(8).max(30),
  direction: z.enum(['inbound', 'outbound']),
  sender: z.enum(['customer', 'bot', 'human']),
  content: z.string().min(1).max(4096),
  occurred_at: z.string().datetime().optional(),
  lead_id: z.string().uuid().optional(),
  contact_name: z.string().min(1).max(160).optional(),
  bot_type: z.string().min(1).max(60).default('tickean'),
  thread_status: z.enum(['active', 'cold', 'qualified', 'closed']).optional(),
  delivery_status: z.enum(['accepted', 'sent', 'delivered', 'read', 'failed']).optional(),
  provider_message_id: z.string().min(10).max(300).optional(),
})

const deliveryStatusSchema = z.object({
  provider_message_id: z.string().min(10).max(300),
  delivery_status: z.enum(['sent', 'delivered', 'read', 'failed']),
  occurred_at: z.string().datetime().optional(),
  recipient_id: z.string().min(8).max(30).optional(),
  error_message: z.string().min(1).max(1000).optional(),
})

const threadControlSchema = z.object({
  operation: z.literal('thread_control'),
  thread_id: z.string().uuid().optional(),
  phone: z.string().min(8).max(30).optional(),
  bot_active: z.boolean(),
  status: z.enum(['active', 'cold', 'qualified', 'closed']).optional(),
}).refine((value) => Boolean(value.thread_id || value.phone), {
  message: 'thread_id or phone is required',
})

const DELIVERY_STATUS_RANK: Record<string, number> = {
  accepted: 0,
  sent: 1,
  delivered: 2,
  read: 3,
}

const normalizePhone = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`
  return digits
}

export async function GET(request: Request) {
  const block = rateLimitOrBlock(request, {
    window: '1m',
    max: 120,
    key: 'aria-whatsapp-events-read',
  })
  if (block) return block

  const auth = requireAriaAuth(request)
  if (auth.error) return auth.error

  const url = new URL(request.url)
  const phone = normalizePhone(url.searchParams.get('phone'))
  const leadId = url.searchParams.get('lead_id')
  if (!phone && !leadId) {
    return NextResponse.json({ error: 'phone or lead_id is required' }, { status: 400 })
  }

  const supabase = getServiceRoleClient()
  try {
    let threadQuery = supabase
      .from('chat_threads')
      .select('id, phone, contact_name, bot_type, bot_active, status, lead_id, last_message_at, last_message_preview')
      .order('last_message_at', { ascending: false })
      .limit(1)
    threadQuery = leadId
      ? threadQuery.eq('lead_id', leadId)
      : threadQuery.eq('phone', phone)

    const { data: threads, error: threadError } = await threadQuery
    if (threadError) throw new Error(threadError.message)
    const thread = (threads ?? [])[0] as { id?: string } | undefined
    if (!thread?.id) return NextResponse.json({ ok: true, thread: null, messages: [] })

    const { data: messages, error: messageError } = await supabase
      .from('chat_messages')
      .select('id, thread_id, phone, direction, sender, content, metadata, created_at')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: true })
      .limit(500)
    if (messageError) throw new Error(messageError.message)

    return NextResponse.json({ ok: true, thread, messages: messages ?? [] })
  } catch (error) {
    return NextResponse.json(
      { error: 'WhatsApp conversation lookup failed', details: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, {
    window: '1m',
    max: 120,
    key: 'aria-whatsapp-events',
  })
  if (block) return block

  const auth = requireAriaAuth(request)
  if (auth.error) return auth.error

  let parsed: z.infer<typeof eventSchema>
  try {
    parsed = eventSchema.parse(await request.json())
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Invalid WhatsApp event',
        details: error instanceof Error ? error.message : 'parse failed',
      },
      { status: 400 },
    )
  }

  const phone = normalizePhone(parsed.phone)
  if (phone.length < 8 || phone.length > 15) {
    return NextResponse.json({ error: 'Invalid normalized phone' }, { status: 400 })
  }

  const occurredAt = parsed.occurred_at ?? new Date().toISOString()
  // Production still has the original chat_threads constraint
  // (invent | bmac | manual). Keep the external bot label in logs while
  // persisting Tickean/Encore acquisition conversations in the Invent lane.
  const persistedBotType = ['bmac', 'manual'].includes(parsed.bot_type)
    ? parsed.bot_type
    : 'invent'
  const supabase = getServiceRoleClient()

  try {
    // Meta retries a webhook whenever the receiver does not acknowledge it in
    // time. The provider message id is stable across those retries, so reject
    // duplicates before touching the thread or inserting another message.
    if (parsed.provider_message_id) {
      const { data: existingMessages, error: duplicateLookupError } = await supabase
        .from('chat_messages')
        .select('id, thread_id')
        .eq('metadata->>provider_message_id', parsed.provider_message_id)
        .order('created_at', { ascending: true })
        .limit(1)
      if (duplicateLookupError) throw new Error(duplicateLookupError.message)

      const existingMessage = (existingMessages ?? [])[0] as {
        id: string
        thread_id: string
      } | undefined
      if (existingMessage) {
        const { data: existingThread, error: existingThreadError } = await supabase
          .from('chat_threads')
          .select('id, lead_id, bot_active, status')
          .eq('id', existingMessage.thread_id)
          .maybeSingle()
        if (existingThreadError) throw new Error(existingThreadError.message)

        logAriaAction('whatsapp.event', {
          direction: parsed.direction,
          sender: parsed.sender,
          bot_type: parsed.bot_type,
          has_provider_message_id: true,
          duplicate: true,
        }, 'ok')

        return NextResponse.json({
          ok: true,
          duplicate: true,
          thread_id: existingMessage.thread_id,
          message_id: existingMessage.id,
          lead_id: (existingThread as { lead_id?: string | null } | null)?.lead_id ?? null,
          bot_active: (existingThread as { bot_active?: boolean } | null)?.bot_active ?? true,
          status: (existingThread as { status?: string } | null)?.status ?? null,
          delivery_status: parsed.delivery_status ?? null,
          provider_message_id: parsed.provider_message_id,
        })
      }
    }

    let leadId = parsed.lead_id ?? null
    let contactName = parsed.contact_name ?? null
    let orgId: string | null = null

    if (!leadId) {
      const phoneTail = phone.slice(-10)
      const { data: candidates, error: leadError } = await supabase
        .from('leads')
        .select('id, name, company, phone, org_id')
        .like('phone', `%${phoneTail}%`)
        .limit(10)
      if (leadError) throw new Error(leadError.message)

      const matchingLead = (candidates ?? []).find(
        (lead: any) => normalizePhone(lead.phone).slice(-10) === phoneTail,
      ) as {
        id: string
        name?: string | null
        company?: string | null
        org_id?: string | null
      } | undefined
      if (matchingLead) {
        leadId = matchingLead.id
        contactName = contactName ?? matchingLead.name ?? matchingLead.company ?? null
        orgId = matchingLead.org_id ?? null
      }
    } else {
      const { data: lead } = await supabase
        .from('leads')
        .select('name, company, org_id')
        .eq('id', leadId)
        .maybeSingle()
      orgId = (lead as any)?.org_id ?? null
      contactName = contactName ?? (lead as any)?.name ?? (lead as any)?.company ?? null
    }

    const { data: existingThread, error: threadLookupError } = await supabase
      .from('chat_threads')
      .select('id, bot_active, status, lead_id, contact_name, org_id')
      .eq('phone', phone)
      .maybeSingle()
    if (threadLookupError) throw new Error(threadLookupError.message)

    let thread = existingThread as {
      id: string
      bot_active: boolean
      status: string
      lead_id: string | null
      contact_name: string | null
      org_id: string | null
    } | null

    orgId = thread?.org_id ?? orgId
    if (!orgId) {
      const { data: organizations } = await supabase
        .from('organizations')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
      orgId = ((organizations ?? [])[0] as { id?: string } | undefined)?.id ?? null
    }
    if (!orgId) throw new Error('No organization could be resolved for the WhatsApp event')

    const threadUpdates = {
      org_id: thread?.org_id ?? orgId,
      last_message_at: occurredAt,
      last_message_preview: parsed.content.slice(0, 120),
      lead_id: thread?.lead_id ?? leadId,
      contact_name: thread?.contact_name ?? contactName,
      status:
        parsed.thread_status ?? (parsed.direction === 'inbound' && (!thread || ['cold', 'pending'].includes(thread.status))
          ? 'active'
          : (thread?.status ?? (parsed.direction === 'outbound' ? 'cold' : 'active'))),
    }

    if (thread) {
      const { data: updated, error } = await supabase
        .from('chat_threads')
        .update(threadUpdates as never)
        .eq('id', thread.id)
        .select('id, bot_active, status, lead_id, contact_name, org_id')
        .single()
      if (error) throw new Error(error.message)
      thread = updated as typeof thread
    } else {
      const { data: created, error } = await supabase
        .from('chat_threads')
        .insert({
          phone,
          bot_type: persistedBotType,
          bot_active: true,
          ...threadUpdates,
        } as never)
        .select('id, bot_active, status, lead_id, contact_name, org_id')
        .single()
      if (error) throw new Error(error.message)
      thread = created as typeof thread
    }

    if (!thread) throw new Error('Thread could not be resolved')

    const { data: message, error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        thread_id: thread.id,
        phone,
        direction: parsed.direction,
        sender: parsed.sender,
        content: parsed.content,
        metadata: {
          ...(parsed.delivery_status ? { delivery_status: parsed.delivery_status } : {}),
          ...(parsed.provider_message_id ? { provider_message_id: parsed.provider_message_id } : {}),
        },
        created_at: occurredAt,
        org_id: thread.org_id ?? orgId,
      } as never)
      .select('id')
      .single()
    if (messageError) throw new Error(messageError.message)

    logAriaAction('whatsapp.event', {
      direction: parsed.direction,
      sender: parsed.sender,
      bot_type: parsed.bot_type,
      has_lead: Boolean(thread.lead_id),
      delivery_status: parsed.delivery_status ?? null,
      has_provider_message_id: Boolean(parsed.provider_message_id),
    }, 'ok')

    return NextResponse.json({
      ok: true,
      thread_id: thread.id,
      message_id: (message as { id: string }).id,
      lead_id: thread.lead_id,
      bot_active: thread.bot_active,
      status: thread.status,
      delivery_status: parsed.delivery_status ?? null,
      provider_message_id: parsed.provider_message_id ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    logAriaAction('whatsapp.event', {
      direction: parsed.direction,
      sender: parsed.sender,
      bot_type: parsed.bot_type,
    }, 'error', message)
    return NextResponse.json(
      { error: 'WhatsApp event failed', details: message },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request) {
  const block = rateLimitOrBlock(request, {
    window: '1m',
    max: 300,
    key: 'aria-whatsapp-events-status',
  })
  if (block) return block

  const auth = requireAriaAuth(request)
  if (auth.error) return auth.error

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Invalid WhatsApp patch request',
        details: error instanceof Error ? error.message : 'parse failed',
      },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  const threadControl = threadControlSchema.safeParse(rawBody)
  if (threadControl.success) {
    try {
      const phone = threadControl.data.phone
        ? normalizePhone(threadControl.data.phone)
        : null
      let query = supabase
        .from('chat_threads')
        .update({
          bot_active: threadControl.data.bot_active,
          ...(threadControl.data.status ? { status: threadControl.data.status } : {}),
        } as never)
      query = threadControl.data.thread_id
        ? query.eq('id', threadControl.data.thread_id)
        : query.eq('phone', phone!)
      const { data: thread, error } = await query
        .select('id, phone, bot_active, status, lead_id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!thread) {
        return NextResponse.json({ error: 'WhatsApp thread not found' }, { status: 404 })
      }

      logAriaAction('whatsapp.thread_control', {
        bot_active: threadControl.data.bot_active,
        status: threadControl.data.status ?? null,
        has_lead: Boolean((thread as { lead_id?: string | null }).lead_id),
      }, 'ok')

      return NextResponse.json({ ok: true, thread })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown'
      logAriaAction('whatsapp.thread_control', {
        bot_active: threadControl.data.bot_active,
      }, 'error', message)
      return NextResponse.json(
        { error: 'WhatsApp thread update failed', details: message },
        { status: 500 },
      )
    }
  }

  let parsed: z.infer<typeof deliveryStatusSchema>
  try {
    parsed = deliveryStatusSchema.parse(rawBody)
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Invalid WhatsApp delivery status',
        details: error instanceof Error ? error.message : 'parse failed',
      },
      { status: 400 },
    )
  }

  try {
    const { data: messages, error: lookupError } = await supabase
      .from('chat_messages')
      .select('id, thread_id, metadata, created_at')
      .eq('metadata->>provider_message_id', parsed.provider_message_id)
      .order('created_at', { ascending: false })
      .limit(1)
    if (lookupError) throw new Error(lookupError.message)

    const message = (messages ?? [])[0] as {
      id: string
      thread_id: string
      metadata?: Record<string, unknown> | null
    } | undefined
    if (!message) {
      return NextResponse.json(
        { error: 'WhatsApp message not found', provider_message_id: parsed.provider_message_id },
        { status: 404 },
      )
    }

    const currentMetadata = message.metadata ?? {}
    const currentStatus =
      typeof currentMetadata.delivery_status === 'string'
        ? currentMetadata.delivery_status
        : 'accepted'
    const currentOccurredAt =
      typeof currentMetadata.delivery_status_at === 'string'
        ? currentMetadata.delivery_status_at
        : null
    const incomingOccurredAt = parsed.occurred_at ?? new Date().toISOString()

    // Meta can deliver status callbacks out of order. Never downgrade a
    // successful lifecycle, and use the provider timestamp for equal stages.
    const currentRank = DELIVERY_STATUS_RANK[currentStatus] ?? -1
    const incomingRank = DELIVERY_STATUS_RANK[parsed.delivery_status] ?? -1
    const shouldApply =
      parsed.delivery_status === 'failed'
        ? currentRank <= DELIVERY_STATUS_RANK.sent
        : incomingRank > currentRank ||
          (incomingRank === currentRank &&
            (!currentOccurredAt || incomingOccurredAt >= currentOccurredAt))

    if (!shouldApply) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        message_id: message.id,
        thread_id: message.thread_id,
        delivery_status: currentStatus,
      })
    }

    const nextMetadata: Record<string, unknown> = {
      ...currentMetadata,
      delivery_status: parsed.delivery_status,
      delivery_status_at: incomingOccurredAt,
      ...(parsed.recipient_id ? { recipient_id: normalizePhone(parsed.recipient_id) } : {}),
      ...(parsed.error_message ? { delivery_error: parsed.error_message } : {}),
    }
    const { error: updateError } = await supabase
      .from('chat_messages')
      .update({ metadata: nextMetadata } as never)
      .eq('id', message.id)
    if (updateError) throw new Error(updateError.message)

    logAriaAction('whatsapp.delivery_status', {
      delivery_status: parsed.delivery_status,
      has_recipient_id: Boolean(parsed.recipient_id),
      has_error: Boolean(parsed.error_message),
    }, 'ok')

    return NextResponse.json({
      ok: true,
      ignored: false,
      message_id: message.id,
      thread_id: message.thread_id,
      delivery_status: parsed.delivery_status,
      occurred_at: incomingOccurredAt,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    logAriaAction('whatsapp.delivery_status', {
      delivery_status: parsed.delivery_status,
    }, 'error', message)
    return NextResponse.json(
      { error: 'WhatsApp delivery status update failed', details: message },
      { status: 500 },
    )
  }
}
