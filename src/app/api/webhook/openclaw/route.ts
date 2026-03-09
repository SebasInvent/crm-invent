// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'
import { processNewInteraction } from '@/lib/auto-create'

// Tipos de eventos que puede recibir de OpenClaw/Sincronía
type OpenClawEvent = 
  | 'conversation.started'
  | 'conversation.message'
  | 'conversation.ended'
  | 'client.created'
  | 'project.requested'
  | 'task.assigned'

interface OpenClawPayload {
  event: OpenClawEvent
  session_id: string
  timestamp: string
  data: {
    client?: {
      id?: string
      name: string
      email?: string
      phone?: string
      company?: string
      telegram_chat_id?: string
      external_id?: string
    }
    message?: {
      id: string
      content: string
      sender: 'client' | 'agent' | 'system'
      timestamp: string
    }
    project?: {
      name: string
      description?: string
      budget?: number
    }
    task?: {
      title: string
      description?: string
      priority?: 'low' | 'medium' | 'high'
    }
    agent?: {
      id: string
      name: string
    }
    metadata?: Record<string, any>
  }
}

export async function POST(request: Request) {
  try {
    const SYNC_SECRET = process.env.SYNC_SECRET
    const authHeader = request.headers.get('authorization')
    
    // Verificar secret key
    if (SYNC_SECRET && authHeader !== `Bearer ${SYNC_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const payload: OpenClawPayload = await request.json()
    const supabase = getServiceRoleClient()

    console.log(`[OpenClaw Webhook] Received event: ${payload.event}`, payload)

    switch (payload.event) {
      case 'conversation.started':
        return handleConversationStarted(payload, supabase)
      
      case 'conversation.message':
        return handleConversationMessage(payload, supabase)
      
      case 'conversation.ended':
        return handleConversationEnded(payload, supabase)
      
      case 'client.created':
        return handleClientCreated(payload, supabase)
      
      case 'project.requested':
        return handleProjectRequested(payload, supabase)
      
      case 'task.assigned':
        return handleTaskAssigned(payload, supabase)
      
      default:
        return NextResponse.json(
          { error: `Unknown event type: ${payload.event}` },
          { status: 400 }
        )
    }

  } catch (error) {
    console.error('[OpenClaw Webhook] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

// Handler: Conversación iniciada
async function handleConversationStarted(payload: OpenClawPayload, supabase: any) {
  const { session_id, data } = payload
  const clientData = data.client

  if (!clientData) {
    return NextResponse.json(
      { error: 'Missing client data' },
      { status: 400 }
    )
  }

  try {
    // Procesar nueva interacción (busca o crea cliente, sesión, etc.)
    const result = await processNewInteraction({
      name: clientData.name,
      email: clientData.email,
      source: 'openclaw',
      external_id: session_id,
      username: clientData.name,
      agent_id: data.agent?.id,
      metadata: {
        session_id,
        event: 'conversation.started',
        ...data.metadata
      }
    })

    return NextResponse.json({
      success: true,
      event: 'conversation.started',
      client_id: result.client.id,
      is_new_client: result.is_new,
      project_id: result.project?.id,
      message: result.is_new 
        ? 'New client and project created automatically'
        : 'Existing client session updated'
    })

  } catch (error) {
    console.error('[OpenClaw] Error handling conversation.started:', error)
    return NextResponse.json(
      { error: 'Failed to process conversation start', details: error.message },
      { status: 500 }
    )
  }
}

// Handler: Nuevo mensaje en conversación
async function handleConversationMessage(payload: OpenClawPayload, supabase: any) {
  const { session_id, data } = payload
  const message = data.message
  const clientData = data.client

  if (!message || !clientData) {
    return NextResponse.json(
      { error: 'Missing message or client data' },
      { status: 400 }
    )
  }

  try {
    // Buscar cliente por session_id
    const { data: existingClient } = await supabase
      .from('clients')
      .select('*')
      .eq('openclaw_session_id', session_id)
      .single()

    let clientId = existingClient?.id

    // Si no existe, crear nuevo
    if (!existingClient) {
      const result = await processNewInteraction({
        name: clientData.name,
        email: clientData.email,
        message: message.content,
        source: 'openclaw',
        external_id: session_id,
        agent_id: data.agent?.id,
        metadata: { session_id, ...data.metadata }
      })
      clientId = result.client.id
    } else {
      // Actualizar timestamp de última interacción
      await supabase
        .from('clients')
        .update({ last_interaction_at: new Date().toISOString() })
        .eq('id', existingClient.id)
    }

    // Guardar mensaje en conversations
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        client_id: clientId,
        message: message.content,
        channel: 'other',
        openclaw_session_id: session_id,
        sender_type: message.sender,
        created_at: message.timestamp || new Date().toISOString(),
        raw_data: { message, agent: data.agent, metadata: data.metadata }
      })
      .select()
      .single()

    if (convError) throw convError

    return NextResponse.json({
      success: true,
      event: 'conversation.message',
      conversation_id: conversation.id,
      client_id: clientId
    })

  } catch (error) {
    console.error('[OpenClaw] Error handling conversation.message:', error)
    return NextResponse.json(
      { error: 'Failed to save message', details: error.message },
      { status: 500 }
    )
  }
}

// Handler: Conversación finalizada
async function handleConversationEnded(payload: OpenClawPayload, supabase: any) {
  const { session_id, data } = payload

  try {
    // Cerrar sesión de chat
    const { data: session } = await supabase
      .from('chat_sessions')
      .update({
        status: 'closed',
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('external_session_id', session_id)
      .select()
      .single()

    // Crear resumen si hay datos
    if (data.metadata?.summary) {
      await supabase.from('conversations').insert({
        client_id: session?.client_id,
        message: `[RESUMEN DE SESIÓN] ${data.metadata.summary}`,
        channel: 'other',
        openclaw_session_id: session_id,
        sender_type: 'system',
        created_at: new Date().toISOString()
      })
    }

    return NextResponse.json({
      success: true,
      event: 'conversation.ended',
      session_id,
      summary_created: !!data.metadata?.summary
    })

  } catch (error) {
    console.error('[OpenClaw] Error handling conversation.ended:', error)
    return NextResponse.json(
      { error: 'Failed to end conversation', details: error.message },
      { status: 500 }
    )
  }
}

// Handler: Cliente creado explícitamente
async function handleClientCreated(payload: OpenClawPayload, supabase: any) {
  const { data } = payload
  const clientData = data.client

  if (!clientData) {
    return NextResponse.json(
      { error: 'Missing client data' },
      { status: 400 }
    )
  }

  try {
    const result = await processNewInteraction({
      name: clientData.name,
      email: clientData.email,
      phone: clientData.phone,
      company: clientData.company,
      source: 'openclaw',
      external_id: payload.session_id,
      metadata: { ...data.metadata, source_event: 'client.created' }
    })

    return NextResponse.json({
      success: true,
      event: 'client.created',
      client_id: result.client.id,
      is_new: result.is_new
    })

  } catch (error) {
    console.error('[OpenClaw] Error handling client.created:', error)
    return NextResponse.json(
      { error: 'Failed to create client', details: error.message },
      { status: 500 }
    )
  }
}

// Handler: Proyecto solicitado
async function handleProjectRequested(payload: OpenClawPayload, supabase: any) {
  const { session_id, data } = payload

  if (!data.project || !data.client) {
    return NextResponse.json(
      { error: 'Missing project or client data' },
      { status: 400 }
    )
  }

  try {
    // Buscar o crear cliente
    let clientId: string
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .eq('openclaw_session_id', session_id)
      .single()

    if (existingClient) {
      clientId = existingClient.id
    } else {
      const result = await processNewInteraction({
        name: data.client.name,
        email: data.client.email,
        message: `Solicitud de proyecto: ${data.project.name}`,
        source: 'openclaw',
        external_id: session_id,
        metadata: data.metadata
      })
      clientId = result.client.id
    }

    // Crear proyecto
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        client_id: clientId,
        name: data.project.name,
        description: data.project.description || `Proyecto solicitado vía OpenClaw`,
        budget: data.project.budget || null,
        status: 'planning',
        start_date: new Date().toISOString(),
        progress: 0
      })
      .select()
      .single()

    if (projectError) throw projectError

    // Crear tarea asociada
    await supabase.from('tasks').insert({
      project_id: project.id,
      title: `Revisar solicitud: ${data.project.name}`,
      description: `Proyecto solicitado por ${data.client.name}. ${data.project.description || ''}`,
      status: 'todo',
      priority: 'high',
      due_date: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    })

    return NextResponse.json({
      success: true,
      event: 'project.requested',
      project_id: project.id,
      client_id: clientId
    })

  } catch (error) {
    console.error('[OpenClaw] Error handling project.requested:', error)
    return NextResponse.json(
      { error: 'Failed to create project', details: error.message },
      { status: 500 }
    )
  }
}

// Handler: Tarea asignada
async function handleTaskAssigned(payload: OpenClawPayload, supabase: any) {
  const { data } = payload

  if (!data.task) {
    return NextResponse.json(
      { error: 'Missing task data' },
      { status: 400 }
    )
  }

  try {
    // Buscar agente por nombre o crearlo
    let agentId = data.agent?.id
    
    if (data.agent?.name && !agentId) {
      const { data: existingAgent } = await supabase
        .from('agents')
        .select('id')
        .eq('name', data.agent.name)
        .single()

      if (existingAgent) {
        agentId = existingAgent.id
      } else {
        // Crear agente temporal
        const { data: newAgent } = await supabase
          .from('agents')
          .insert({
            name: data.agent.name,
            email: `agent_${Date.now()}@temp.com`,
            role: 'AI Assistant',
            skills: [],
            is_active: true
          })
          .select()
          .single()
        
        agentId = newAgent?.id
      }
    }

    // Crear tarea de agente
    const { data: agentTask, error } = await supabase
      .from('agent_tasks')
      .insert({
        agent_id: agentId,
        title: data.task.title,
        description: data.task.description,
        priority: data.task.priority || 'medium',
        status: 'assigned',
        assigned_at: new Date().toISOString(),
        notes: `Asignado desde OpenClaw/Sincronía`
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      event: 'task.assigned',
      task_id: agentTask.id,
      agent_id: agentId
    })

  } catch (error) {
    console.error('[OpenClaw] Error handling task.assigned:', error)
    return NextResponse.json(
      { error: 'Failed to assign task', details: error.message },
      { status: 500 }
    )
  }
}

