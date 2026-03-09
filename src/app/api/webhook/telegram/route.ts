// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'

interface TelegramMessage {
  message_id: number
  from?: {
    id: number
    first_name: string
    last_name?: string
    username?: string
  }
  chat: {
    id: number
    type: string
  }
  date: number
  text?: string
  caption?: string
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
}

// Webhook para recibir mensajes de Telegram
export async function POST(request: Request) {
  try {
    const SYNC_SECRET = process.env.SYNC_SECRET
    const authHeader = request.headers.get('authorization')
    
    // Verificar secret key si está configurado
    if (SYNC_SECRET && authHeader !== `Bearer ${SYNC_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const update: TelegramUpdate = await request.json()
    const message = update.message || update.edited_message

    if (!message || !message.text) {
      return NextResponse.json(
        { success: true, message: 'No message content' },
        { status: 200 }
      )
    }

    const supabase = getServiceRoleClient()

    // Buscar o crear cliente basado en el chat de Telegram
    const telegramChatId = message.chat.id.toString()
    const clientName = message.from?.first_name + (message.from?.last_name ? ` ${message.from.last_name}` : '') || 'Telegram User'
    const username = message.from?.username

    // Buscar cliente existente por telegram_chat_id
    let { data: existingClient } = await supabase
      .from('clients')
      .select('*')
      .eq('telegram_chat_id', telegramChatId)
      .single()

    let clientId = existingClient?.id

    // Si no existe, crear nuevo cliente
    if (!existingClient) {
      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert({
          name: clientName,
          email: username ? `${username}@telegram.user` : `telegram_${telegramChatId}@placeholder.com`,
          company: null,
          phone: null,
          status: 'lead',
          priority: 'medium',
          lifetime_value: 0,
          telegram_chat_id: telegramChatId,
          telegram_username: username,
          source: 'telegram'
        })
        .select()
        .single()

      if (clientError) {
        console.error('Error creating client from Telegram:', clientError)
        return NextResponse.json(
          { error: 'Failed to create client' },
          { status: 500 }
        )
      }

      clientId = newClient.id
      existingClient = newClient

      // Crear proyecto automático para nuevos leads de Telegram
      const { data: newProject, error: projectError } = await supabase
        .from('projects')
        .insert({
          client_id: clientId,
          name: `Consulta Telegram - ${clientName}`,
          description: `Proyecto creado automáticamente desde conversación de Telegram. Primer mensaje: "${message.text.substring(0, 100)}${message.text.length > 100 ? '...' : ''}"`,
          status: 'planning',
          budget: null,
          start_date: new Date().toISOString(),
          progress: 0
        })
        .select()
        .single()

      if (projectError) {
        console.error('Error creating project:', projectError)
      }

      // Crear tarea inicial
      if (newProject) {
        await supabase.from('tasks').insert({
          project_id: newProject.id,
          title: 'Responder a consulta de Telegram',
          description: `Mensaje del cliente: ${message.text}`,
          status: 'todo',
          priority: 'high',
          due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 horas
        })
      }
    }

    // Guardar la conversación
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        client_id: clientId,
        message: message.text || message.caption || '',
        channel: 'telegram',
        created_at: new Date(message.date * 1000).toISOString(),
        telegram_message_id: message.message_id.toString(),
        telegram_chat_id: telegramChatId,
        raw_data: update
      })
      .select()
      .single()

    if (convError) {
      console.error('Error saving conversation:', convError)
      return NextResponse.json(
        { error: 'Failed to save conversation' },
        { status: 500 }
      )
    }

    // Notificar a OpenClaw/Sincronía si está configurado
    const openclawWebhookUrl = process.env.OPENCLAW_WEBHOOK_URL
    if (openclawWebhookUrl) {
      try {
        await fetch(openclawWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENCLAW_API_KEY || ''}`
          },
          body: JSON.stringify({
            event: 'new_conversation',
            client: existingClient,
            conversation: conversation,
            source: 'telegram'
          })
        })
      } catch (notifyError) {
        console.error('Error notifying OpenClaw:', notifyError)
      }
    }

    return NextResponse.json({
      success: true,
      client_id: clientId,
      conversation_id: conversation?.id,
      is_new_client: !existingClient?.id
    })

  } catch (error) {
    console.error('Error in Telegram webhook:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET para verificación del webhook (requerido por Telegram)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  // Verificación simple
  if (mode === 'subscribe' && token === process.env.TELEGRAM_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ status: 'Webhook active' })
}
