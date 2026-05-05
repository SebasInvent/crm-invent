// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'

// POST /api/leads/[id]/convert - Convertir lead a cliente
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  // 🔐 Auth required — converting a lead changes CRM state
  const auth = await requireAuth()
  if (auth.error) return auth.error

  try {
    const leadId = params.id
    const supabase = getServiceRoleClient()
    
    // Obtener lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()
    
    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }
    
    // Crear cliente desde lead
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .insert({
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        company: lead.company,
        status: 'lead',
        priority: lead.priority || 'medium',
        lifetime_value: 0,
        source: lead.source,
        metadata: {
          converted_from_lead_id: leadId,
          jung_archetype: lead.jung_archetype,
          original_source: lead.source_platform
        }
      })
      .select()
      .single()
    
    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 })
    }
    
    // Actualizar lead como convertido
    await supabase
      .from('leads')
      .update({
        lead_status: 'converted',
        converted_to_client_id: client.id,
        converted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
    
    // Crear proyecto inicial
    const { data: project } = await supabase
      .from('projects')
      .insert({
        client_id: client.id,
        name: `Proyecto ${lead.jung_archetype ? `(${lead.jung_archetype})` : ''}`,
        description: `Proyecto creado desde lead convertido`,
        status: 'planning',
        progress: 0,
        start_date: new Date().toISOString()
      })
      .select()
      .single()
    
    return NextResponse.json({
      success: true,
      client,
      project,
      message: 'Lead convertido a cliente exitosamente'
    })
    
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
