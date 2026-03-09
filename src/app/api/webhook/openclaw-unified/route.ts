// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'

// Tipos de eventos OpenClaw
interface OpenClawPayload {
  event: 'conversation.started' | 'conversation.message' | 'conversation.ended' | 'client.created'
  session_id: string
  timestamp: string
  data: {
    client?: {
      name: string
      email?: string
      phone?: string
      company?: string
    }
    message?: {
      id: string
      content: string
      role: 'user' | 'assistant' | 'system'
      tokens_used?: number
      latency_ms?: number
    }
    context?: Record<string, any>
    metadata?: Record<string, any>
  }
}

export async function POST(request: Request) {
  try {
    console.log('[OpenClaw] Webhook recibido:', new Date().toISOString())
    
    const payload: OpenClawPayload = await request.json()
    const supabase = getServiceRoleClient()
    
    console.log(`[OpenClaw] Evento: ${payload.event}, Session: ${payload.session_id}`)
    
    switch (payload.event) {
      case 'conversation.started':
        return handleConversationStarted(payload, supabase)
      
      case 'conversation.message':
        return handleConversationMessage(payload, supabase)
      
      case 'conversation.ended':
        return handleConversationEnded(payload, supabase)
      
      case 'client.created':
        return handleClientCreated(payload, supabase)
      
      default:
        return NextResponse.json(
          { error: `Unknown event: ${payload.event}` },
          { status: 400 }
        )
    }
    
  } catch (error) {
    console.error('[OpenClaw] Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

// Handler: Nueva conversación iniciada
async function handleConversationStarted(payload: OpenClawPayload, supabase: any) {
  const { session_id, data } = payload
  const clientData = data.client
  
  if (!clientData) {
    return NextResponse.json({ error: 'Missing client data' }, { status: 400 })
  }
  
  try {
    // 1. Buscar o crear cliente
    let { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('openclaw_session_id', session_id)
      .maybeSingle()
    
    if (!client) {
      // Crear nuevo cliente
      const { data: newClient, error } = await supabase
        .from('clients')
        .insert({
          name: clientData.name,
          email: clientData.email,
          phone: clientData.phone,
          company: clientData.company,
          status: 'lead',
          priority: 'medium',
          source: 'openclaw',
          openclaw_session_id: session_id,
          last_interaction_at: new Date().toISOString(),
          metadata: { ...data.metadata, session_id }
        })
        .select()
        .single()
      
      if (error) throw error
      client = newClient
      console.log('[OpenClaw] Cliente creado:', client.id)
    }
    
    // 2. Crear sesión de OpenClaw
    const { data: session, error: sessionError } = await supabase
      .from('openclaw_sessions')
      .insert({
        client_id: client.id,
        session_id: session_id,
        status: 'active',
        context: data.context || {},
        channel: 'web',
        start_time: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (sessionError) {
      console.error('[OpenClaw] Error creando sesión:', sessionError)
    }
    
    // 3. Crear proyecto automático
    const { data: project } = await supabase
      .from('projects')
      .insert({
        client_id: client.id,
        name: `Lead OpenClaw - ${clientData.name}`,
        description: `Conversación iniciada vía OpenClaw. Sesión: ${session_id}`,
        status: 'planning',
        start_date: new Date().toISOString()
      })
      .select()
      .single()
    
    // 4. Registrar en conversaciones CRM
    await supabase.from('conversations').insert({
      client_id: client.id,
      message: `Conversación iniciada con OpenClaw por ${clientData.name}`,
      channel: 'openclaw',
      sender_type: 'system',
      openclaw_session_id: session_id
    })
    
    return NextResponse.json({
      success: true,
      client_id: client.id,
      session_id: session?.id,
      project_id: project?.id,
      is_new: !client
    })
    
  } catch (error) {
    console.error('[OpenClaw] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Handler: Nuevo mensaje
async function handleConversationMessage(payload: OpenClawPayload, supabase: any) {
  const { session_id, data } = payload
  const message = data.message
  
  if (!message) {
    return NextResponse.json({ error: 'Missing message' }, { status: 400 })
  }
  
  try {
    // 1. Buscar sesión
    const { data: session } = await supabase
      .from('openclaw_sessions')
      .select('*, clients(id, name)')
      .eq('session_id', session_id)
      .maybeSingle()
    
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found. Call conversation.started first' },
        { status: 404 }
      )
    }
    
    // 2. Guardar mensaje en openclaw_messages
    const { data: msg, error: msgError } = await supabase
      .from('openclaw_messages')
      .insert({
        session_id: session.id,
        client_id: session.client_id,
        role: message.role,
        content: message.content,
        model: data.metadata?.model,
        tokens_used: message.tokens_used,
        latency_ms: message.latency_ms,
        context_snapshot: data.context
      })
      .select()
      .single()
    
    if (msgError) throw msgError
    
    // 3. Actualizar contador de mensajes en sesión
    await supabase
      .from('openclaw_sessions')
      .update({
        message_count: session.message_count + 1,
        last_activity_at: new Date().toISOString(),
        context: { ...session.context, ...data.context }
      })
      .eq('id', session.id)
    
    // 4. Si es mensaje del usuario, guardar en conversaciones CRM
    if (message.role === 'user') {
      await supabase.from('conversations').insert({
        client_id: session.client_id,
        message: message.content,
        channel: 'openclaw',
        sender_type: 'client',
        openclaw_session_id: session_id,
        openclaw_message_id: msg.id
      })
    }
    
    // 5. Guardar contexto si hay cambios
    if (data.context) {
      for (const [key, value] of Object.entries(data.context)) {
        await supabase.from('openclaw_contexts').upsert({
          session_id: session.id,
          client_id: session.client_id,
          key: key,
          value: value,
          updated_at: new Date().toISOString()
        }, { onConflict: 'session_id,key' })
      }
    }
    
    return NextResponse.json({
      success: true,
      message_id: msg.id,
      session_id: session.id
    })
    
  } catch (error) {
    console.error('[OpenClaw] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Handler: Conversación finalizada
async function handleConversationEnded(payload: OpenClawPayload, supabase: any) {
  const { session_id, data } = payload
  
  try {
    const { data: session } = await supabase
      .from('openclaw_sessions')
      .select('*')
      .eq('session_id', session_id)
      .maybeSingle()
    
    if (session) {
      // Cerrar sesión
      await supabase
        .from('openclaw_sessions')
        .update({
          status: 'ended',
          end_time: new Date().toISOString(),
          context: { ...session.context, summary: data.metadata?.summary }
        })
        .eq('id', session.id)
      
      // Registrar evento
      await supabase.from('openclaw_events').insert({
        session_id: session.id,
        client_id: session.client_id,
        event_type: 'session_ended',
        event_data: { summary: data.metadata?.summary }
      })
      
      // Registrar en CRM
      await supabase.from('conversations').insert({
        client_id: session.client_id,
        message: `Conversación finalizada. ${data.metadata?.summary || ''}`,
        channel: 'openclaw',
        sender_type: 'system',
        openclaw_session_id: session_id
      })
    }
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('[OpenClaw] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Handler: Cliente creado explícitamente
async function handleClientCreated(payload: OpenClawPayload, supabase: any) {
  // Similar a conversation.started pero sin crear sesión
  return handleConversationStarted(payload, supabase)
}
