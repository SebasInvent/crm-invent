// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'

// GET /api/debug/database - Diagnóstico completo de la base de datos
export async function GET(request: Request) {
  try {
    const supabase = getServiceRoleClient()
    const results = {
      timestamp: new Date().toISOString(),
      environment: {
        url: process.env.VERCEL_URL || 'localhost',
        has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      tables: {} as Record<string, any>,
      recent_data: {} as Record<string, any>,
      errors: [] as string[]
    }

    // 1. Verificar tabla clients
    try {
      const { data: clients, error: clientsError, count: clientsCount } = await supabase
        .from('clients')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(10)

      if (clientsError) {
        results.errors.push(`clients: ${clientsError.message}`)
        results.tables.clients = { exists: false, error: clientsError.message }
      } else {
        results.tables.clients = {
          exists: true,
          count: clientsCount || clients?.length || 0,
          columns: clients?.[0] ? Object.keys(clients[0]) : []
        }
        results.recent_data.clients = clients?.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          source: c.source,
          openclaw_session_id: c.openclaw_session_id,
          telegram_chat_id: c.telegram_chat_id,
          status: c.status,
          created_at: c.created_at
        })) || []
      }
    } catch (e) {
      results.errors.push(`clients exception: ${e.message}`)
    }

    // 2. Contar por source
    try {
      const { data: bySource } = await supabase
        .from('clients')
        .select('source, count')

      if (bySource) {
        const counts = {}
        bySource.forEach(row => {
          counts[row.source || 'unknown'] = (counts[row.source || 'unknown'] || 0) + 1
        })
        results.tables.clients.by_source = counts
      }
    } catch (e) {
      // Silenciar error de count
    }

    // 3. Verificar tabla conversations
    try {
      const { data: conversations, error: convError, count: convCount } = await supabase
        .from('conversations')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(5)

      if (convError) {
        results.errors.push(`conversations: ${convError.message}`)
        results.tables.conversations = { exists: false, error: convError.message }
      } else {
        results.tables.conversations = {
          exists: true,
          count: convCount || conversations?.length || 0
        }
        results.recent_data.conversations = conversations?.map(c => ({
          id: c.id,
          client_id: c.client_id,
          channel: c.channel,
          message_preview: c.message?.substring(0, 50),
          created_at: c.created_at
        })) || []
      }
    } catch (e) {
      results.errors.push(`conversations exception: ${e.message}`)
    }

    // 4. Verificar tabla projects
    try {
      const { count: projectCount, error: projectError } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })

      if (projectError) {
        results.errors.push(`projects: ${projectError.message}`)
        results.tables.projects = { exists: false, error: projectError.message }
      } else {
        results.tables.projects = {
          exists: true,
          count: projectCount || 0
        }
      }
    } catch (e) {
      results.errors.push(`projects exception: ${e.message}`)
    }

    // 5. Verificar tabla chat_sessions
    try {
      const { count: sessionCount, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('*', { count: 'exact', head: true })

      if (sessionError) {
        results.tables.chat_sessions = { exists: false, error: sessionError.message }
      } else {
        results.tables.chat_sessions = {
          exists: true,
          count: sessionCount || 0
        }
      }
    } catch (e) {
      results.tables.chat_sessions = { exists: false, error: e.message }
    }

    // 6. Buscar específicamente clientes con openclaw_session_id
    try {
      const { data: openclawClients } = await supabase
        .from('clients')
        .select('*')
        .not('openclaw_session_id', 'is', null)
        .order('created_at', { ascending: false })

      results.openclaw_clients = {
        count: openclawClients?.length || 0,
        clients: openclawClients?.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          openclaw_session_id: c.openclaw_session_id,
          source: c.source,
          created_at: c.created_at
        })) || []
      }
    } catch (e) {
      results.openclaw_clients = { error: e.message }
    }

    // 7. Verificar últimas conversaciones de OpenClaw
    try {
      const { data: openclawConvs } = await supabase
        .from('conversations')
        .select('*')
        .not('openclaw_session_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5)

      results.openclaw_conversations = {
        count: openclawConvs?.length || 0,
        recent: openclawConvs?.map(c => ({
          id: c.id,
          client_id: c.client_id,
          openclaw_session_id: c.openclaw_session_id,
          message_preview: c.message?.substring(0, 50),
          created_at: c.created_at
        })) || []
      }
    } catch (e) {
      results.openclaw_conversations = { error: e.message }
    }

    // Determinar estado general
    const allTablesExist = results.tables.clients?.exists && 
                          results.tables.conversations?.exists &&
                          results.tables.projects?.exists

    return NextResponse.json({
      ...results,
      status: allTablesExist ? 'OK' : 'ERROR',
      has_openclaw_data: (results.openclaw_clients?.count || 0) > 0,
      recommendations: !allTablesExist 
        ? ['Ejecutar supabase_schema.sql para crear las tablas faltantes']
        : (results.openclaw_clients?.count || 0) === 0
          ? ['No hay clientes de OpenClaw. Verificar que el webhook esté configurado correctamente']
          : ['Todo parece correcto. Revisar logs de Vercel para más detalles.']
    })

  } catch (error) {
    return NextResponse.json({
      status: 'FATAL_ERROR',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// POST /api/debug/database - Simular creación desde OpenClaw
export async function POST(request: Request) {
  try {
    const supabase = getServiceRoleClient()
    const testSessionId = `test_session_${Date.now()}`
    
    console.log('[Debug] Creando cliente de prueba tipo OpenClaw...')
    
    // 1. Crear cliente
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .insert({
        name: 'Cliente Test OpenClaw',
        email: `test_${Date.now()}@openclaw.com`,
        status: 'lead',
        priority: 'medium',
        lifetime_value: 0,
        source: 'openclaw',
        openclaw_session_id: testSessionId,
        created_at: new Date().toISOString(),
        last_interaction_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (clientError) {
      return NextResponse.json({
        success: false,
        step: 'create_client',
        error: clientError
      }, { status: 500 })
    }
    
    console.log('[Debug] Cliente creado:', client.id)
    
    // 2. Crear proyecto
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        client_id: client.id,
        name: 'Proyecto Test OpenClaw',
        description: 'Proyecto creado desde test de diagnóstico',
        status: 'planning',
        start_date: new Date().toISOString(),
        progress: 0
      })
      .select()
      .single()
    
    if (projectError) {
      console.error('[Debug] Error creando proyecto:', projectError)
    }
    
    // 3. Crear conversación
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        client_id: client.id,
        message: 'Mensaje de prueba desde OpenClaw',
        channel: 'other',
        openclaw_session_id: testSessionId,
        sender_type: 'client',
        created_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (convError) {
      console.error('[Debug] Error creando conversación:', convError)
    }
    
    return NextResponse.json({
      success: true,
      message: 'Datos de prueba creados exitosamente',
      test_data: {
        session_id: testSessionId,
        client: {
          id: client.id,
          name: client.name,
          email: client.email,
          source: client.source
        },
        project: project ? {
          id: project.id,
          name: project.name
        } : null,
        conversation: conversation ? {
          id: conversation.id,
          message: conversation.message
        } : null
      }
    })
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}
