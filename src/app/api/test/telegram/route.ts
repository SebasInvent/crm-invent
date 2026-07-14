// @ts-nocheck
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

// POST /api/test/telegram - Simular un mensaje de Telegram para testing
export async function POST(request: Request) {
  // Endpoint interno: exige sesión (expone/escribe datos reales con service-role).
  const _auth = await requireAuth()
  if (_auth.error) return _auth.error
  try {
    const supabase = getServiceRoleClient()
    
    // Simular un update de Telegram
    const testUpdate = {
      update_id: Math.floor(Math.random() * 1000000),
      message: {
        message_id: Math.floor(Math.random() * 1000000),
        from: {
          id: 123456789,
          first_name: 'Usuario',
          last_name: 'Test',
          username: 'testuser'
        },
        chat: {
          id: 123456789,
          type: 'private'
        },
        date: Math.floor(Date.now() / 1000),
        text: 'Hola, estoy interesado en los servicios de marketing digital'
      }
    }

    console.log('🧪 Enviando mensaje de prueba a webhook de Telegram...')
    
    // Llamar al webhook internamente
    const webhookResponse = await fetch(`${(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')}/api/webhook/telegram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testUpdate)
    })

    const result = await webhookResponse.json()

    return NextResponse.json({
      success: webhookResponse.ok,
      status: webhookResponse.status,
      result,
      test_data: testUpdate
    })

  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

// GET /api/test/telegram - Verificar configuración
export async function GET(request: Request) {
  // Endpoint interno: exige sesión (expone/escribe datos reales con service-role).
  const _auth = await requireAuth()
  if (_auth.error) return _auth.error
  try {
    const supabase = getServiceRoleClient()
    
    // Verificar que las tablas existen
    const checks = await Promise.all([
      supabase.from('clients').select('count').limit(1),
      supabase.from('conversations').select('count').limit(1),
      supabase.from('projects').select('count').limit(1),
      supabase.from('tasks').select('count').limit(1)
    ])

    const tablesExist = {
      clients: !checks[0].error,
      conversations: !checks[1].error,
      projects: !checks[2].error,
      tasks: !checks[3].error
    }

    // Contar clientes de Telegram existentes
    const { data: telegramClients } = await supabase
      .from('clients')
      .select('id, name, telegram_chat_id, created_at')
      .eq('source', 'telegram')
      .order('created_at', { ascending: false })
      .limit(5)

    return NextResponse.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: {
        vercel_url: process.env.VERCEL_URL || 'localhost',
        has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        has_supabase_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      },
      database: {
        tables_exist: tablesExist,
        telegram_clients_count: telegramClients?.length || 0,
        recent_telegram_clients: telegramClients || []
      },
      webhook_url: `${(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')}/api/webhook/telegram`
    })

  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
