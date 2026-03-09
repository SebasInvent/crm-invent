// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'

// GET /api/leads - Listar leads
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const archetype = searchParams.get('archetype')
    const priority = searchParams.get('priority')
    const limit = parseInt(searchParams.get('limit') || '50')
    
    const supabase = getServiceRoleClient()
    
    let query = supabase
      .from('leads')
      .select('*')
      .order('lead_score', { ascending: false })
      .limit(limit)
    
    if (status) {
      query = query.eq('lead_status', status)
    }
    
    if (archetype) {
      query = query.eq('jung_archetype', archetype)
    }
    
    if (priority) {
      query = query.eq('priority', priority)
    }
    
    const { data: leads, error } = await query
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ leads })
    
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/leads - Crear nuevo lead
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = getServiceRoleClient()
    
    // Calcular lead score automáticamente
    const leadScore = calculateLeadScore(body)
    
    const leadData = {
      ...body,
      lead_score: leadScore,
      lead_status: getLeadStatusFromScore(leadScore),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    
    const { data: lead, error } = await supabase
      .from('leads')
      .insert(leadData)
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ lead }, { status: 201 })
    
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT /api/leads - Actualizar lead
export async function PUT(request: Request) {
  try {
    const { id, ...updates } = await request.json()
    const supabase = getServiceRoleClient()
    
    // Recalcular score si cambiaron campos relevantes
    let leadScore = updates.lead_score
    if (updates.budget_level || updates.authority_level || updates.need_urgency || updates.timeline) {
      leadScore = calculateLeadScore(updates)
      updates.lead_score = leadScore
      updates.lead_status = getLeadStatusFromScore(leadScore)
    }
    
    const { data: lead, error } = await supabase
      .from('leads')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ lead })
    
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/leads - Eliminar lead
export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()
    const supabase = getServiceRoleClient()
    
    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', id)
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Función para calcular lead score
function calculateLeadScore(lead: any): number {
  let score = 0
  
  // Budget (40 puntos max)
  if (lead.budget_level === 'high') score += 40
  else if (lead.budget_level === 'medium') score += 25
  else if (lead.budget_level === 'low') score += 10
  
  // Authority (30 puntos max)
  if (lead.authority_level === 'decision_maker') score += 30
  else if (lead.authority_level === 'influencer') score += 20
  else if (lead.authority_level === 'user') score += 5
  
  // Need (20 puntos max)
  if (lead.need_urgency === 'critical') score += 20
  else if (lead.need_urgency === 'high') score += 15
  else if (lead.need_urgency === 'medium') score += 10
  else if (lead.need_urgency === 'low') score += 5
  
  // Timeline (10 puntos max)
  if (lead.timeline === 'immediate') score += 10
  else if (lead.timeline === 'short_term') score += 7
  else if (lead.timeline === 'medium_term') score += 5
  else if (lead.timeline === 'long_term') score += 2
  
  return Math.min(score, 100)
}

function getLeadStatusFromScore(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 80) return 'hot'
  if (score >= 50) return 'warm'
  return 'cold'
}
