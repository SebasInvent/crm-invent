import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServiceRoleClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'
import {
  getWhatsAppLine,
  lineMetadata,
  sendWhatsAppText,
  toPublicWhatsAppLine,
} from '@/lib/whatsapp-lines.server'

const sendWaSchema = z.object({
  phone: z.string().min(8).max(20),
  text: z.string().min(1).max(4096),
  threadId: z.string().uuid().optional(),
  lineId: z.enum(['tickean', 'invent']).optional(),
})

type ThreadRow = {
  id: string
  phone: string
  org_id: string | null
  metadata?: Record<string, unknown> | null
}

const cleanPhoneNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 && digits.startsWith('3') ? `57${digits}` : digits
}

async function resolveThread(params: {
  threadId?: string
  phone: string
  text: string
  senderMetadata: Record<string, unknown>
}) {
  const supabase = getServiceRoleClient()
  let thread: ThreadRow | null = null

  if (params.threadId) {
    const { data, error } = await supabase
      .from('chat_threads')
      .select('id, phone, org_id, metadata')
      .eq('id', params.threadId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    thread = data as ThreadRow | null
  }

  if (!thread) {
    const { data, error } = await supabase
      .from('chat_threads')
      .select('id, phone, org_id, metadata')
      .eq('phone', params.phone)
      .maybeSingle()
    if (error) throw new Error(error.message)
    thread = data as ThreadRow | null
  }

  if (thread && cleanPhoneNumber(thread.phone) !== params.phone) {
    throw new Error('El hilo no corresponde al teléfono de destino')
  }

  let orgId = thread?.org_id ?? null
  if (!orgId) {
    const { data, error } = await supabase
      .from('organizations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
    if (error) throw new Error(error.message)
    orgId = ((data ?? [])[0] as { id?: string } | undefined)?.id ?? null
  }
  if (!orgId) throw new Error('No se pudo resolver la organización del chat')

  const now = new Date().toISOString()
  const metadata = {
    ...(thread?.metadata ?? {}),
    ...params.senderMetadata,
  }

  if (thread) {
    const { data, error } = await supabase
      .from('chat_threads')
      .update({
        org_id: orgId,
        bot_active: false,
        last_message_at: now,
        last_message_preview: params.text.slice(0, 120),
        metadata,
      } as never)
      .eq('id', thread.id)
      .select('id, phone, org_id, metadata')
      .single()
    if (error) throw new Error(error.message)
    return data as ThreadRow
  }

  const { data, error } = await supabase
    .from('chat_threads')
    .insert({
      phone: params.phone,
      org_id: orgId,
      bot_type: 'invent',
      bot_active: false,
      status: 'active',
      last_message_at: now,
      last_message_preview: params.text.slice(0, 120),
      metadata,
    } as never)
    .select('id, phone, org_id, metadata')
    .single()
  if (error) throw new Error(error.message)
  return data as ThreadRow
}

/**
 * Envía un mensaje manual desde la línea elegida en Control.
 *
 * El mensaje se registra como `queued` antes de llamar al proveedor. Si el
 * proveedor falla, queda visible como `failed` en vez de aparentar un envío
 * exitoso. La identidad de la línea queda tanto en el hilo como en el mensaje.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const parsed = sendWaSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Payload inválido', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const phone = cleanPhoneNumber(parsed.data.phone)
  if (phone.length < 8 || phone.length > 15) {
    return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 })
  }

  let line
  try {
    line = getWhatsAppLine(parsed.data.lineId)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Línea no disponible' },
      { status: 503 },
    )
  }

  const supabase = getServiceRoleClient()
  const senderMetadata = lineMetadata(line)
  let messageId: string | null = null

  try {
    const thread = await resolveThread({
      threadId: parsed.data.threadId,
      phone,
      text: parsed.data.text,
      senderMetadata,
    })

    const queuedMetadata = {
      ...senderMetadata,
      delivery_status: 'queued',
      delivery_status_at: new Date().toISOString(),
    }
    const { data: queuedMessage, error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        thread_id: thread.id,
        phone,
        direction: 'outbound',
        sender: 'human',
        content: parsed.data.text,
        metadata: queuedMetadata,
        org_id: thread.org_id,
      } as never)
      .select('id')
      .single()
    if (insertError) throw new Error(insertError.message)
    messageId = (queuedMessage as { id: string }).id

    try {
      const provider = await sendWhatsAppText({
        line,
        phone,
        text: parsed.data.text,
      })
      const acceptedMetadata = {
        ...queuedMetadata,
        delivery_status: provider.providerStatus || 'accepted',
        delivery_status_at: new Date().toISOString(),
        ...(provider.providerMessageId
          ? { provider_message_id: provider.providerMessageId }
          : {}),
      }
      const { error: updateError } = await supabase
        .from('chat_messages')
        .update({ metadata: acceptedMetadata } as never)
        .eq('id', messageId)

      return NextResponse.json({
        success: true,
        threadId: thread.id,
        messageId,
        providerMessageId: provider.providerMessageId ?? null,
        line: toPublicWhatsAppLine(line),
        ...(updateError ? { auditWarning: updateError.message } : {}),
      })
    } catch (providerError) {
      const reason =
        providerError instanceof Error ? providerError.message : 'Proveedor no disponible'
      await supabase
        .from('chat_messages')
        .update({
          metadata: {
            ...queuedMetadata,
            delivery_status: 'failed',
            delivery_status_at: new Date().toISOString(),
            delivery_error: reason.slice(0, 1000),
          },
        } as never)
        .eq('id', messageId)

      return NextResponse.json(
        { error: 'WhatsApp no aceptó el mensaje', details: reason, messageId },
        { status: 502 },
      )
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: 'No se pudo preparar el envío',
        details: error instanceof Error ? error.message : 'Error interno',
        messageId,
      },
      { status: 500 },
    )
  }
}

const patchWaSchema = z.object({
  threadId: z.string().uuid(),
  bot_active: z.boolean().optional(),
  status: z.enum(['active', 'cold', 'qualified', 'closed']).optional(),
})

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  try {
    const parsed = patchWaSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Payload inválido', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const updates: Record<string, unknown> = {}
    if (typeof parsed.data.bot_active === 'boolean') {
      updates.bot_active = parsed.data.bot_active
    }
    if (parsed.data.status) updates.status = parsed.data.status
    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { error } = await supabase
      .from('chat_threads')
      .update(updates as never)
      .eq('id', parsed.data.threadId)
    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 },
    )
  }
}
