// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const supabase = getServiceRoleClient()
    const checks = {
      database: false,
      tables: {} as Record<string, boolean>,
      webhooks: {
        telegram: '/api/webhook/telegram',
        openclaw: '/api/webhook/openclaw',
        sync: '/api/sync/from-local'
      },
      environment: {
        supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabase_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        service_role_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        resend_key: !!process.env.RESEND_API_KEY,
        sync_secret: !!process.env.SYNC_SECRET
      },
      timestamp: new Date().toISOString()
    }

    // Verificar conexión a la base de datos
    const { data: dbCheck, error: dbError } = await supabase
      .from('clients')
      .select('count')
      .limit(1)

    checks.database = !dbError

    // Verificar tablas principales
    const tablesToCheck = [
      'clients',
      'projects',
      'conversations',
      'chat_sessions',
      'agents',
      'agent_tasks',
      'tasks'
    ]

    for (const table of tablesToCheck) {
      const { error } = await supabase
        .from(table)
        .select('id')
        .limit(1)
      
      checks.tables[table] = !error
    }

    // Estadísticas rápidas
    const { count: clientCount } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })

    const { count: conversationCount } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })

    const { count: activeSessions } = await supabase
      .from('chat_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')

    return NextResponse.json({
      status: checks.database ? 'healthy' : 'unhealthy',
      checks,
      stats: {
        total_clients: clientCount || 0,
        total_conversations: conversationCount || 0,
        active_sessions: activeSessions || 0
      },
      endpoints: {
        telegram_webhook: 'POST /api/webhook/telegram - Recibe mensajes de Telegram',
        openclaw_webhook: 'POST /api/webhook/openclaw - Recibe eventos de OpenClaw',
        sync_endpoint: 'POST/PUT /api/sync/from-local - Sincronización bidireccional'
      }
    })

  } catch (error) {
    console.error('Health check error:', error)
    return NextResponse.json(
      { 
        status: 'error',
        message: 'Failed to run health check',
        error: error.message 
      },
      { status: 500 }
    )
  }
}

// Endpoint para verificar configuración específica
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { check_type, test_data } = body

    const supabase = getServiceRoleClient()

    switch (check_type) {
      case 'test_telegram_webhook': {
        // Simular mensaje de Telegram
        const testMessage = test_data || {
          message: {
            message_id: 999999,
            from: { id: 12345, first_name: 'Test', username: 'testuser' },
            chat: { id: 12345, type: 'private' },
            date: Math.floor(Date.now() / 1000),
            text: 'Mensaje de prueba'
          }
        }

        return NextResponse.json({
          test: 'telegram_webhook',
          simulated_data: testMessage,
          expected_flow: [
            '1. Buscar cliente por telegram_chat_id',
            '2. Si no existe, crear nuevo cliente',
            '3. Crear proyecto automáticamente',
            '4. Crear tarea inicial',
            '5. Guardar conversación',
            '6. Crear/actualizar sesión de chat'
          ],
          webhook_url: '/api/webhook/telegram'
        })
      }

      case 'test_openclaw_webhook': {
        const testEvent = test_data || {
          event: 'conversation.started',
          session_id: 'test-session-123',
          timestamp: new Date().toISOString(),
          data: {
            client: { name: 'Test Client', email: 'test@example.com' },
            agent: { id: 'agent-1', name: 'Test Agent' }
          }
        }

        return NextResponse.json({
          test: 'openclaw_webhook',
          simulated_data: testEvent,
          supported_events: [
            'conversation.started',
            'conversation.message',
            'conversation.ended',
            'client.created',
            'project.requested',
            'task.assigned'
          ],
          webhook_url: '/api/webhook/openclaw'
        })
      }

      case 'check_sync_status': {
        const { data: recentConversations } = await supabase
          .from('conversations')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5)

        const { data: recentClients } = await supabase
          .from('clients')
          .select('id, name, source, created_at')
          .order('created_at', { ascending: false })
          .limit(5)

        return NextResponse.json({
          test: 'sync_status',
          recent_conversations: recentConversations || [],
          recent_clients: recentClients || [],
          sync_ready: true
        })
      }

      default:
        return NextResponse.json(
          { error: 'Unknown check_type', available_checks: ['test_telegram_webhook', 'test_openclaw_webhook', 'check_sync_status'] },
          { status: 400 }
        )
    }

  } catch (error) {
    console.error('Check error:', error)
    return NextResponse.json(
      { error: 'Check failed', details: error.message },
      { status: 500 }
    )
  }
}
