// @ts-nocheck
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * Utilidades para seguimiento de campañas de email y interacciones
 */

interface EmailInteraction {
  contact_id: string
  email: string
  subject: string
  content: string
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced'
  sent_at: string
  opened_at?: string
  clicked_at?: string
  replied_at?: string
  campaign_id?: string
  metadata?: any
}

/**
 * Obtiene estadísticas completas de una campaña
 */
export async function getCampaignStats(campaignId: string) {
  const supabase = getServiceRoleClient()
  
  // 1. Info de campaña
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()
  
  // 2. Mensajes enviados
  const { data: messages, error } = await supabase
    .from('unified_messages')
    .select('*')
    .eq('metadata->>campaign_id', campaignId)
  
  if (error) throw error
  
  // 3. Calcular estadísticas
  const stats = {
    total: messages?.length || 0,
    sent: messages?.filter(m => m.status === 'sent').length || 0,
    delivered: messages?.filter(m => m.status === 'delivered').length || 0,
    opened: messages?.filter(m => m.status === 'read' || m.metadata?.opened_at).length || 0,
    clicked: messages?.filter(m => m.metadata?.clicked_at).length || 0,
    replied: messages?.filter(m => m.direction === 'inbound').length || 0,
    bounced: messages?.filter(m => m.status === 'failed').length || 0,
    
    // Tasas
    open_rate: 0,
    click_rate: 0,
    reply_rate: 0,
    bounce_rate: 0
  }
  
  // Calcular porcentajes
  if (stats.total > 0) {
    stats.open_rate = Math.round((stats.opened / stats.total) * 100)
    stats.click_rate = Math.round((stats.clicked / stats.total) * 100)
    stats.reply_rate = Math.round((stats.replied / stats.total) * 100)
    stats.bounce_rate = Math.round((stats.bounced / stats.total) * 100)
  }
  
  return {
    campaign,
    stats,
    messages: messages || []
  }
}

/**
 * Obtiene el historial completo de interacciones con un contacto
 */
export async function getContactInteractionHistory(contactId: string) {
  const supabase = getServiceRoleClient()
  
  // 1. Info del contacto
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .single()
  
  // 2. Todos los mensajes (inbound y outbound)
  const { data: messages, error } = await supabase
    .from('unified_messages')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
  
  if (error) throw error
  
  // 3. Timeline de interacciones
  const timeline = messages?.map(m => ({
    id: m.id,
    type: m.channel_type,
    direction: m.direction,
    status: m.status,
    content: m.content?.substring(0, 200),
    subject: m.subject,
    created_at: m.created_at,
    opened_at: m.metadata?.opened_at,
    clicked_at: m.metadata?.clicked_at,
    campaign_id: m.metadata?.campaign_id
  })) || []
  
  // 4. Calcular métricas de engagement
  const engagement = {
    total_messages: messages?.length || 0,
    outbound_count: messages?.filter(m => m.direction === 'outbound').length || 0,
    inbound_count: messages?.filter(m => m.direction === 'inbound').length || 0,
    last_interaction: messages?.[messages.length - 1]?.created_at,
    response_rate: 0
  }
  
  if (engagement.outbound_count > 0) {
    engagement.response_rate = Math.round(
      (engagement.inbound_count / engagement.outbound_count) * 100
    )
  }
  
  return {
    contact,
    timeline,
    engagement,
    messages: messages || []
  }
}

/**
 * Marca una interacción como respondida por un agente
 */
export async function markAsReplied(messageId: string, agentId: string, replyContent: string) {
  const supabase = getServiceRoleClient()
  
  const { data: message, error } = await supabase
    .from('unified_messages')
    .update({
      status: 'replied',
      assigned_to: agentId,
      metadata: {
        replied_at: new Date().toISOString(),
        replied_by: agentId,
        reply_content: replyContent
      }
    })
    .eq('id', messageId)
    .select()
    .single()
  
  if (error) throw error
  return message
}

/**
 * Obtiene contactos que no han respondido (follow-up needed)
 */
export async function getNonResponders(campaignId: string, daysAgo: number = 7) {
  const supabase = getServiceRoleClient()
  
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysAgo)
  
  // Contactos que recibieron email pero no respondieron
  const { data: nonResponders, error } = await supabase.rpc('get_campaign_non_responders', {
    p_campaign_id: campaignId,
    p_cutoff_date: cutoffDate.toISOString()
  })
  
  if (error) {
    // Fallback si la función RPC no existe
    const { data: messages } = await supabase
      .from('unified_messages')
      .select(`
        *,
        contacts(*)
      `)
      .eq('metadata->>campaign_id', campaignId)
      .eq('direction', 'outbound')
      .lt('created_at', cutoffDate.toISOString())
    
    const respondedIds = new Set()
    const allMessages = messages || []
    
    // Buscar quién respondió
    for (const msg of allMessages) {
      const { data: replies } = await supabase
        .from('unified_messages')
        .select('id')
        .eq('contact_id', msg.contact_id)
        .eq('direction', 'inbound')
        .gt('created_at', msg.created_at)
        .limit(1)
      
      if (replies && replies.length > 0) {
        respondedIds.add(msg.contact_id)
      }
    }
    
    return allMessages
      .filter(m => !respondedIds.has(m.contact_id))
      .map(m => ({
        contact: m.contacts,
        last_email_sent: m.created_at,
        email_subject: m.subject
      }))
  }
  
  return nonResponders || []
}

/**
 * Obtiene el dashboard de actividad de campañas
 */
export async function getCampaignDashboard(days: number = 30) {
  const supabase = getServiceRoleClient()
  
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  
  // 1. Todas las campañas del período
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false })
  
  // 2. Estadísticas agregadas
  const { data: messages } = await supabase
    .from('unified_messages')
    .select('*')
    .gte('created_at', startDate.toISOString())
  
  const stats = {
    total_campaigns: campaigns?.length || 0,
    total_emails_sent: messages?.filter(m => m.direction === 'outbound').length || 0,
    total_replies: messages?.filter(m => m.direction === 'inbound').length || 0,
    total_opens: messages?.filter(m => m.metadata?.opened_at).length || 0,
    total_clicks: messages?.filter(m => m.metadata?.clicked_at).length || 0,
    
    // Promedios
    avg_open_rate: 0,
    avg_reply_rate: 0,
    active_conversations: 0
  }
  
  // 3. Conversaciones activas
  const { data: activeConvs } = await supabase
    .from('conversations')
    .select('*')
    .eq('status', 'active')
    .gt('unread_count', 0)
  
  stats.active_conversations = activeConvs?.length || 0
  
  return {
    campaigns: campaigns || [],
    stats,
    recent_activity: messages?.slice(0, 20) || []
  }
}

/**
 * Genera un resumen de la actividad reciente para mostrar en el inbox
 */
export async function getInboxSummary(limit: number = 10) {
  const supabase = getServiceRoleClient()
  
  // Mensajes recientes con info de contacto
  const { data: messages, error } = await supabase
    .from('unified_messages')
    .select(`
      *,
      contacts(first_name, last_name, company_name, email)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (error) throw error
  
  // Conversaciones que necesitan atención (unread > 0)
  const { data: pendingConversations } = await supabase
    .from('conversations')
    .select(`
      *,
      contacts(first_name, last_name, company_name)
    `)
    .eq('status', 'active')
    .gt('unread_count', 0)
    .order('last_message_at', { ascending: false })
    .limit(limit)
  
  return {
    recent_messages: messages || [],
    pending_conversations: pendingConversations || [],
    needs_attention: (pendingConversations || []).length
  }
}
