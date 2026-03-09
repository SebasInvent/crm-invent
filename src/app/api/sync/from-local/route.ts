// @ts-nocheck
// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    const SYNC_SECRET = process.env.SYNC_SECRET
    
    // Verificar secret key
    const authHeader = request.headers.get('authorization')
    if (!SYNC_SECRET || authHeader !== `Bearer ${SYNC_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { table, data, operation = 'upsert' } = body

    if (!table || !data) {
      return NextResponse.json(
        { error: 'Missing required fields: table, data' },
        { status: 400 }
      )
    }

    const supabase = getServiceRoleClient()

    // Tablas permitidas para sync
    const allowedTables = [
      'clients',
      'projects', 
      'tasks',
      'conversations',
      'agents',
      'agent_tasks',
      'agent_deliverables'
    ]

    if (!allowedTables.includes(table)) {
      return NextResponse.json(
        { error: `Table ${table} not allowed for sync` },
        { status: 400 }
      )
    }

    let result

    if (operation === 'upsert') {
      // Upsert: insertar o actualizar
      result = await supabase
        .from(table)
        .upsert(data, { onConflict: 'id' })
        .select()
    } else if (operation === 'delete') {
      // Eliminar
      result = await supabase
        .from(table)
        .delete()
        .eq('id', data.id)
    } else if (operation === 'insert') {
      // Solo insertar
      result = await supabase
        .from(table)
        .insert(data)
        .select()
    } else {
      return NextResponse.json(
        { error: `Operation ${operation} not supported` },
        { status: 400 }
      )
    }

    if (result.error) {
      console.error(`Sync error for table ${table}:`, result.error)
      return NextResponse.json(
        { error: 'Sync failed', details: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      table,
      operation,
      records: result.data?.length || 0
    })

  } catch (error) {
    console.error('Error in sync endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Endpoint para sync batch (múltiples tablas)
export async function PUT(request: Request) {
  try {
    const SYNC_SECRET = process.env.SYNC_SECRET
    const authHeader = request.headers.get('authorization')
    if (!SYNC_SECRET || authHeader !== `Bearer ${SYNC_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { syncData } = body // Array de { table, data, operation }

    if (!Array.isArray(syncData)) {
      return NextResponse.json(
        { error: 'syncData must be an array' },
        { status: 400 }
      )
    }

    const supabase = getServiceRoleClient()
    const results = []

    for (const item of syncData) {
      const { table, data, operation = 'upsert' } = item
      
      const allowedTables = [
        'clients', 'projects', 'tasks', 'conversations',
        'agents', 'agent_tasks', 'agent_deliverables'
      ]

      if (!allowedTables.includes(table)) {
        results.push({ table, error: 'Table not allowed', skipped: true })
        continue
      }

      try {
        let result
        if (operation === 'upsert') {
          result = await supabase.from(table).upsert(data, { onConflict: 'id' })
        } else if (operation === 'delete') {
          result = await supabase.from(table).delete().eq('id', data.id)
        } else if (operation === 'insert') {
          result = await supabase.from(table).insert(data)
        }

        results.push({
          table,
          operation,
          success: !result?.error,
          error: result?.error?.message
        })
      } catch (err: any) {
        results.push({
          table,
          operation,
          success: false,
          error: err.message
        })
      }
    }

    return NextResponse.json({
      success: true,
      results
    })

  } catch (error) {
    console.error('Error in batch sync:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
