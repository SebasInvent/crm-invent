// @ts-nocheck
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

// GET /api/test/clients - Diagnóstico de clientes
export async function GET(request: Request) {
  // Endpoint interno: exige sesión (expone/escribe datos reales con service-role).
  const _auth = await requireAuth()
  if (_auth.error) return _auth.error
  try {
    const supabase = getServiceRoleClient()
    
    // 1. Contar todos los clientes
    const { data: allClients, error: countError } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (countError) {
      return NextResponse.json({
        error: 'Error fetching clients',
        details: countError
      }, { status: 500 })
    }
    
    // 2. Contar por source
    const bySource = allClients?.reduce((acc, client) => {
      acc[client.source || 'unknown'] = (acc[client.source || 'unknown'] || 0) + 1
      return acc
    }, {})
    
    // 3. Verificar columnas importantes
    const sampleClient = allClients?.[0]
    const columns = sampleClient ? Object.keys(sampleClient) : []
    
    // 4. Buscar clientes de OpenClaw específicamente
    const openclawClients = allClients?.filter(c => c.source === 'openclaw') || []
    
    // 5. Buscar por openclaw_session_id
    const { data: bySessionId } = await supabase
      .from('clients')
      .select('id, name, openclaw_session_id, created_at')
      .not('openclaw_session_id', 'is', null)
      .order('created_at', { ascending: false })
    
    return NextResponse.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      summary: {
        total_clients: allClients?.length || 0,
        by_source: bySource,
        openclaw_clients: openclawClients.length,
        recent_clients: allClients?.slice(0, 5).map(c => ({
          id: c.id,
          name: c.name,
          source: c.source,
          created_at: c.created_at
        }))
      },
      details: {
        available_columns: columns,
        openclaw_clients_details: openclawClients.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          openclaw_session_id: c.openclaw_session_id,
          created_at: c.created_at
        })),
        clients_with_session_id: bySessionId || []
      }
    })
    
  } catch (error) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}

// POST /api/test/clients - Simular creación desde OpenClaw
export async function POST(request: Request) {
  // Endpoint interno: exige sesión (expone/escribe datos reales con service-role).
  const _auth = await requireAuth()
  if (_auth.error) return _auth.error
  try {
    const supabase = getServiceRoleClient()
    
    // Crear un cliente de prueba como si viniera de OpenClaw
    const testClient = {
      name: 'Cliente Test OpenClaw',
      email: `test_openclaw_${Date.now()}@example.com`,
      status: 'lead',
      priority: 'medium',
      lifetime_value: 0,
      source: 'openclaw',
      openclaw_session_id: `test_session_${Date.now()}`,
      created_at: new Date().toISOString(),
      last_interaction_at: new Date().toISOString()
    }
    
    const { data: client, error } = await supabase
      .from('clients')
      .insert(testClient)
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({
        error: 'Failed to create test client',
        details: error
      }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      message: 'Test client created successfully',
      client
    })
    
  } catch (error) {
    return NextResponse.json({
      error: error.message
    }, { status: 500 })
  }
}
