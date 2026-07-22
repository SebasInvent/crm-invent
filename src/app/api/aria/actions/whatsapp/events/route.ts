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
})

const normalizePhone = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`
  return digits
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
  const supabase = getServiceRoleClient()

  try {
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
        parsed.direction === 'inbound' && (!thread || ['cold', 'pending'].includes(thread.status))
          ? 'active'
          : (thread?.status ?? 'active'),
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
          bot_type: parsed.bot_type,
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
    }, 'ok')

    return NextResponse.json({
      ok: true,
      thread_id: thread.id,
      message_id: (message as { id: string }).id,
      lead_id: thread.lead_id,
      bot_active: thread.bot_active,
      status: thread.status,
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
