// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { validateWebhookToken } from '@/lib/api-auth'

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
  // 🚧 Rate limit per source IP — guards against abuse / DDoS-via-bot
  // Telegram's official servers won't hit this; spammers will.
  const blocked = rateLimitOrBlock(request, { key: 'telegram', window: '1m', max: 60 })
  if (blocked) return blocked

  try {
    // Log para debugging
    console.log('📨 Telegram webhook recibido:', new Date().toISOString())

    // 🔐 Token validation (constant-time compare). Set TELEGRAM_WEBHOOK_TOKEN
    // in env and configure Telegram bot's webhook URL with ?token=...
    const expectedToken = process.env.TELEGRAM_WEBHOOK_TOKEN
    if (!validateWebhookToken(request, expectedToken)) {
      console.error('❌ Token de webhook inválido o no configurado')
      return NextResponse.json(
        { error: 'Invalid webhook token' },
        { status: 401 }
      )
    }

    const update: TelegramUpdate = await request.json()
    console.log('📦 Update de Telegram:', JSON.stringify(update, null, 2))
    
    const message = update.message || update.edited_message

    if (!message) {
      console.log('⚠️ No hay mensaje en el update')
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

    console.log('👤 Buscando cliente por telegram_chat_id:', telegramChatId)

    // Buscar cliente existente por telegram_chat_id
    let { data: existingClient, error: findError } = await supabase
      .from('clients')
      .select('*')
      .eq('telegram_chat_id', telegramChatId)
      .maybeSingle()
    
    if (findError) {
      console.error('❌ Error buscando cliente:', findError)
    }

    let clientId = existingClient?.id
    let isNewClient = false

    // Si no existe, crear nuevo cliente
    if (!existingClient) {
      console.log('🆕 Creando nuevo cliente:', clientName)
      isNewClient = true
      
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
          source: 'telegram',
          last_interaction_at: new Date().toISOString()
        })
        .select()
        .single()

      if (clientError) {
        console.error('❌ Error creando cliente:', clientError)
        return NextResponse.json(
          { error: 'Failed to create client', details: clientError },
          { status: 500 }
        )
      }

      clientId = newClient.id
      existingClient = newClient
      console.log('✅ Cliente creado:', clientId)

      // Crear proyecto automático para nuevos leads de Telegram
      const { data: newProject, error: projectError } = await supabase
        .from('projects')
        .insert({
          client_id: clientId,
          name: `Consulta Telegram - ${clientName}`,
          description: `Proyecto creado automáticamente desde conversación de Telegram. Primer mensaje: "${(message.text || '').substring(0, 100)}..."`,
          status: 'planning',
          budget: null,
          start_date: new Date().toISOString(),
          progress: 0
        })
        .select()
        .single()

      if (projectError) {
        console.error('❌ Error creando proyecto:', projectError)
      } else {
        console.log('✅ Proyecto creado:', newProject?.id)
        
        // Crear tarea inicial
        const { error: taskError } = await supabase.from('tasks').insert({
          project_id: newProject?.id,
          title: 'Responder a consulta de Telegram',
          description: `Mensaje del cliente: ${message.text || message.caption || '(sin texto)'}`,
          status: 'todo',
          priority: 'high',
          due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 horas
        })
        
        if (taskError) {
          console.error('❌ Error creando tarea:', taskError)
        } else {
          console.log('✅ Tarea creada')
        }
      }
    } else {
      console.log('👤 Cliente existente encontrado:', clientId)
      
      // Actualizar last_interaction_at
      await supabase
        .from('clients')
        .update({ last_interaction_at: new Date().toISOString() })
        .eq('id', clientId)
    }

    // Guardar la conversación
    const conversationData = {
      client_id: clientId,
      message: message.text || message.caption || '',
      channel: 'telegram',
      created_at: new Date(message.date * 1000).toISOString(),
      telegram_message_id: message.message_id.toString(),
      telegram_chat_id: telegramChatId,
      sender_type: 'client',
      raw_data: update
    }
    
    console.log('💬 Guardando conversación:', conversationData)
    
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert(conversationData)
      .select()
      .single()

    if (convError) {
      console.error('❌ Error guardando conversación:', convError)
      return NextResponse.json(
        { error: 'Failed to save conversation', details: convError },
        { status: 500 }
      )
    }
    
    console.log('✅ Conversación guardada:', conversation?.id)

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
        console.log('✅ Notificación enviada a OpenClaw')
      } catch (notifyError) {
        console.error('⚠️ Error notificando OpenClaw:', notifyError)
      }
    }

    return NextResponse.json({
      success: true,
      client_id: clientId,
      conversation_id: conversation?.id,
      is_new_client: isNewClient
    })

  } catch (error) {
    console.error('❌ Error fatal en Telegram webhook:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

// GET para verificación del webhook
export async function GET(request: Request) {
  console.log('🔍 GET request a webhook de Telegram:', new Date().toISOString())
  
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  console.log('🔑 Parámetros:', { mode, token: token ? '***' : null, challenge: challenge ? '***' : null })

  // Verificación para webhooks (estilo Facebook/Meta)
  if (mode === 'subscribe' && token === process.env.TELEGRAM_VERIFY_TOKEN) {
    console.log('✅ Verificación exitosa')
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ 
    status: 'Webhook active',
    timestamp: new Date().toISOString(),
    endpoint: '/api/webhook/telegram'
  })
}
