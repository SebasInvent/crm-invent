import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServiceRoleClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'

const EVO_URL = 'https://ievoapi.inventagency.co'
const EVO_KEY = process.env.EVOLUTION_API_KEY
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Invent'

const sendWaSchema = z.object({
  phone: z.string().min(8).max(20),
  text: z.string().min(1).max(4096),
  threadId: z.string().uuid().optional(),
})

/**
 * Envía un mensaje manual desde el CRM:
 * 1. Lo guarda en chat_messages (sender='human')
 * 2. Pausa el bot para esa conversación (bot_active=false)
 * 3. Llama a Evolution API para enviar el WhatsApp
 *
 * 🔐 Auth required.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  if (!EVO_KEY) {
    return NextResponse.json(
      { error: 'EVOLUTION_API_KEY env var not configured on server' },
      { status: 500 }
    )
  }

  try {
    const body = await req.json()
    const parsed = sendWaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { phone, text, threadId } = parsed.data

    const cleanPhone = String(phone).replace(/[^0-9]/g, '')
    const supabase = getServiceRoleClient()

    // 1. Asegurar thread (si no viene, upsert por phone)
    let resolvedThreadId = threadId
    if (!resolvedThreadId) {
      const { data: thread } = await supabase
        .from('chat_threads' as never)
        .upsert(
          {
            phone: cleanPhone,
            bot_type: 'invent',
            bot_active: false,
            last_message_at: new Date().toISOString(),
            last_message_preview: text.substring(0, 120),
          } as never,
          { onConflict: 'phone' }
        )
        .select()
        .single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolvedThreadId = (thread as any)?.id
    } else {
      // Pausar bot + actualizar preview
      await supabase
        .from('chat_threads' as never)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          bot_active: false,
          last_message_at: new Date().toISOString(),
          last_message_preview: text.substring(0, 120),
        } as never)
        .eq('id', resolvedThreadId)
    }

    // 2. Insertar mensaje en historial
    if (resolvedThreadId) {
      await supabase
        .from('chat_messages' as never)
        .insert({
          thread_id: resolvedThreadId,
          phone: cleanPhone,
          direction: 'outbound',
          sender: 'human',
          content: text,
        } as never)
    }

    // 3. Enviar por Evolution API
    const evoResp = await fetch(
      `${EVO_URL}/message/sendText/${encodeURIComponent(EVO_INSTANCE)}`,
      {
        method: 'POST',
        headers: {
          apikey: EVO_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ number: cleanPhone, text }),
      }
    )

    if (!evoResp.ok) {
      const errBody = await evoResp.text()
      return NextResponse.json(
        { error: 'Evolution API falló', details: errBody, evoStatus: evoResp.status },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true, threadId: resolvedThreadId })
  } catch (err) {
    return NextResponse.json(
      { error: 'Error interno', message: (err as Error).message },
      { status: 500 }
    )
  }
}

/**
 * PATCH: alternar estado del bot (pausar / reanudar) o cambiar status del thread
 */
export async function PATCH(req: NextRequest) {
  try {
    const { threadId, bot_active, status } = await req.json()
    if (!threadId) return NextResponse.json({ error: 'threadId requerido' }, { status: 400 })

    const supabase = getServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {}
    if (typeof bot_active === 'boolean') updates.bot_active = bot_active
    if (status) updates.status = status

    await supabase
      .from('chat_threads' as never)
      .update(updates as never)
      .eq('id', threadId)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
