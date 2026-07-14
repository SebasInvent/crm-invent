// @ts-nocheck
import { NextResponse } from 'next/server'
import { validateWebhookToken } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * Webhook para sincronizar oportunidades desde OpenClaw
 * 
 * POST /api/webhook/openclaw/deals
 * 
 * Eventos soportados:
 * - opportunity.created: Nueva oportunidad en OpenClaw
 * - opportunity.updated: Oportunidad actualizada
 * - opportunity.won: Oportunidad ganada
 * - opportunity.lost: Oportunidad perdida
 * - opportunity.stage_changed: Cambio de etapa
 */

export async function POST(request: Request) {
  // Verificación opt-in: si OPENCLAW_WEBHOOK_TOKEN está seteado, se exige token
  // (?token= o header x-webhook-token). Sin el env, se mantiene compatibilidad.
  const _wt = process.env.OPENCLAW_WEBHOOK_TOKEN
  if (_wt && !validateWebhookToken(request, _wt)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const body = await request.json()
    const { 
      event,           // 'opportunity.created', 'opportunity.updated', etc.
      data,            // Datos de la oportunidad
      timestamp,
      signature        // Para verificación (opcional)
    } = body

    console.log(`[OpenClaw Webhook] Event: ${event}`, new Date().toISOString())

    const supabase = getServiceRoleClient()

    switch (event) {
      case 'opportunity.created':
        return await handleOpportunityCreated(data, supabase)
      
      case 'opportunity.updated':
        return await handleOpportunityUpdated(data, supabase)
      
      case 'opportunity.won':
        return await handleOpportunityWon(data, supabase)
      
      case 'opportunity.lost':
        return await handleOpportunityLost(data, supabase)
      
      case 'opportunity.stage_changed':
        return await handleStageChanged(data, supabase)
      
      default:
        return NextResponse.json({ 
          success: true, 
          message: 'Event ignored',
          event 
        })
    }

  } catch (error) {
    console.error('[OpenClaw Webhook] Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

// Crear nueva oportunidad desde OpenClaw
async function handleOpportunityCreated(data: any, supabase: any) {
  try {
    const {
      client,           // {name, email, phone, company}
      title,            // Nombre del proyecto
      description,
      value,
      currency = 'USD',
      stage,            // 'Nuevo Lead', 'Calificación', etc.
      source = 'openclaw',
      tags = [],
      metadata = {},
      expected_close_date,
      assignee          // {name, email} del agente
    } = data

    // 1. Buscar o crear contacto
    let contactId = await findOrCreateContact(client, supabase)

    // 2. Buscar etapa del pipeline
    let stageId = await findStageByName(stage, supabase)
    
    // 3. Buscar agente asignado
    let ownerId = await findAgentByEmail(assignee?.email, supabase)

    // 4. Crear el deal
    const { data: deal, error } = await supabase
      .from('deals')
      .insert({
        contact_id: contactId,
        name: title,
        description: description,
        value: value || 0,
        currency: currency,
        stage_id: stageId,
        status: 'open',
        probability: await getStageProbability(stageId, supabase),
        expected_close_date: expected_close_date,
        source: source,
        tags: tags,
        custom_fields: {
          ...metadata,
          openclaw_id: data.id,           // ID original de OpenClaw
          openclaw_conversation_id: data.conversation_id,
          openclaw_created_at: data.created_at
        },
        owner_id: ownerId,
        line_items: data.line_items || [],
        last_activity_at: new Date().toISOString(),
        last_activity_type: 'deal_created'
      })
      .select()
      .single()

    if (error) throw error

    // 5. Registrar en activity log
    await logActivity({
      deal_id: deal.id,
      contact_id: contactId,
      activity_type: 'deal_created',
      title: 'Oportunidad creada desde OpenClaw',
      description: `Valor: ${value} ${currency}`,
      metadata: { source: 'openclaw', openclaw_id: data.id }
    }, supabase)

    console.log(`[OpenClaw] Deal created: ${deal.id}`)

    return NextResponse.json({
      success: true,
      event: 'opportunity.created',
      deal_id: deal.id,
      contact_id: contactId,
      message: 'Opportunity synced successfully'
    })

  } catch (error) {
    console.error('[OpenClaw] Error creating opportunity:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

// Actualizar oportunidad existente
async function handleOpportunityUpdated(data: any, supabase: any) {
  try {
    // Buscar deal por openclaw_id en custom_fields
    const { data: existingDeal } = await supabase
      .from('deals')
      .select('id')
      .eq('custom_fields->>openclaw_id', data.id)
      .single()

    if (!existingDeal) {
      return NextResponse.json(
        { error: 'Deal not found', openclaw_id: data.id },
        { status: 404 }
      )
    }

    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    // Actualizar campos si vienen en el payload
    if (data.title) updateData.name = data.title
    if (data.description) updateData.description = data.description
    if (data.value) updateData.value = data.value
    if (data.tags) updateData.tags = data.tags
    if (data.custom_fields) {
      updateData.custom_fields = {
        ...data.custom_fields,
        openclaw_id: data.id,
        last_sync: new Date().toISOString()
      }
    }

    const { data: deal, error } = await supabase
      .from('deals')
      .update(updateData)
      .eq('id', existingDeal.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      event: 'opportunity.updated',
      deal_id: deal.id
    })

  } catch (error) {
    console.error('[OpenClaw] Error updating opportunity:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

// Marcar como ganada
async function handleOpportunityWon(data: any, supabase: any) {
  const { data: deal } = await supabase
    .from('deals')
    .update({
      status: 'won',
      won_reason: data.reason || 'Ganada desde OpenClaw',
      actual_close_date: data.closed_at || new Date().toISOString(),
      probability: 100,
      updated_at: new Date().toISOString()
    })
    .eq('custom_fields->>openclaw_id', data.id)
    .select()
    .single()

  if (deal) {
    await logActivity({
      deal_id: deal.id,
      activity_type: 'deal_won',
      title: 'Oportunidad GANADA 🎉',
      description: `Cerrada desde OpenClaw. Valor: ${deal.value}`,
      metadata: { won_reason: data.reason }
    }, supabase)
  }

  return NextResponse.json({ success: true, deal_id: deal?.id })
}

// Marcar como perdida
async function handleOpportunityLost(data: any, supabase: any) {
  const { data: deal } = await supabase
    .from('deals')
    .update({
      status: 'lost',
      lost_reason: data.reason || 'Perdida desde OpenClaw',
      competitor: data.competitor,
      actual_close_date: data.closed_at || new Date().toISOString(),
      probability: 0,
      updated_at: new Date().toISOString()
    })
    .eq('custom_fields->>openclaw_id', data.id)
    .select()
    .single()

  if (deal) {
    await logActivity({
      deal_id: deal.id,
      activity_type: 'deal_lost',
      title: 'Oportunidad PERDIDA 😞',
      description: `Razón: ${data.reason}`,
      metadata: { lost_reason: data.reason, competitor: data.competitor }
    }, supabase)
  }

  return NextResponse.json({ success: true, deal_id: deal?.id })
}

// Cambio de etapa
async function handleStageChanged(data: any, supabase: any) {
  const stageId = await findStageByName(data.new_stage, supabase)
  const probability = await getStageProbability(stageId, supabase)

  const { data: deal } = await supabase
    .from('deals')
    .update({
      stage_id: stageId,
      probability: probability,
      updated_at: new Date().toISOString()
    })
    .eq('custom_fields->>openclaw_id', data.opportunity_id)
    .select()
    .single()

  if (deal) {
    await logActivity({
      deal_id: deal.id,
      activity_type: 'stage_change',
      title: 'Cambio de Etapa',
      description: `De "${data.previous_stage}" a "${data.new_stage}"`,
      metadata: { 
        from_stage: data.previous_stage,
        to_stage: data.new_stage,
        changed_by: data.changed_by
      }
    }, supabase)
  }

  return NextResponse.json({ 
    success: true, 
    deal_id: deal?.id,
    new_stage: data.new_stage 
  })
}

// Helper: Buscar o crear contacto
async function findOrCreateContact(client: any, supabase: any) {
  if (!client?.email) {
    throw new Error('Client email is required')
  }

  // Buscar por email
  let { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .ilike('email', client.email)
    .maybeSingle()

  if (existing) return existing.id

  // Crear nuevo contacto
  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert({
      first_name: client.name?.split(' ')[0] || client.name,
      last_name: client.name?.split(' ').slice(1).join(' ') || '',
      email: client.email,
      phone: client.phone,
      company_name: client.company,
      type: 'lead',
      status: 'active',
      lead_source: 'openclaw',
      last_interaction_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) throw error
  return newContact.id
}

// Helper: Buscar etapa por nombre
async function findStageByName(stageName: string, supabase: any) {
  if (!stageName) return null

  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('id, default_probability')
    .ilike('name', stageName)
    .maybeSingle()

  return stage?.id || null
}

// Helper: Obtener probabilidad de etapa
async function getStageProbability(stageId: string, supabase: any) {
  if (!stageId) return 0

  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('default_probability')
    .eq('id', stageId)
    .single()

  return stage?.default_probability || 0
}

// Helper: Buscar agente por email
async function findAgentByEmail(email: string, supabase: any) {
  if (!email) return null

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  return agent?.id || null
}

// Helper: Registrar actividad
async function logActivity(activity: any, supabase: any) {
  try {
    await supabase
      .from('activity_logs')
      .insert({
        ...activity,
        performed_by: activity.performed_by || 'system',
        activity_date: new Date().toISOString(),
        created_at: new Date().toISOString()
      })
  } catch (error) {
    console.error('Error logging activity:', error)
  }
}
