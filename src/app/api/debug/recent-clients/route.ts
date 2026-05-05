// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'

// GET /api/debug/recent-clients - Ver clientes recientes
export async function GET(request: Request) {
  try {
    const supabase = getServiceRoleClient()
    
    // Buscar clientes recientes (últimas 24 horas)
    const { data: recentClients } = await supabase
      .from('clients')
      .select('*')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
    
    // Buscar por nombre "sebastian martinez" específicamente
    const { data: sebastianClients } = await supabase
      .from('clients')
      .select('*')
      .ilike('name', '%sebastian%')
    
    // Buscar clientes con openclaw_session_id
    const { data: openclawClients } = await supabase
      .from('clients')
      .select('*')
      .not('openclaw_session_id', 'is', null)
      .order('created_at', { ascending: false })
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      recent_clients_last_24h: recentClients || [],
      sebastian_martinez_search: sebastianClients || [],
      openclaw_clients: openclawClients || [],
      total_clients: (recentClients?.length || 0) + (openclawClients?.length || 0)
    })
    
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
