// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'
import { contactService } from '@/lib/contact-service'

/**
 * Webhook para recibir respuestas de emails
 * Configurar esta URL en tu proveedor de email (SendGrid, AWS SES, etc.)
 * para recibir notificaciones de respuestas, opens y clicks
 * 
 * POST /api/webhook/email/reply
 */
export async function POST(request: Request) {
  try {
    console.log('[Email Webhook] Received webhook:', new Date().toISOString())
    
    const body = await request.json()
    const supabase = getServiceRoleClient()
    
    // Determinar tipo de evento según el proveedor
    const eventType = detectEventType(body)
    
    console.log('[Email Webhook] Event type:', eventType)
    console.log('[Email Webhook] Payload:', JSON.stringify(body, null, 2))
    
    switch (eventType) {
      case 'email_reply':
        return handleEmailReply(body, supabase)
      case 'email_open':
        return handleEmailOpen(body, supabase)
      case 'email_click':
        return handleEmailClick(body, supabase)
      case 'email_bounce':
        return handleEmailBounce(body, supabase)
      default:
        return NextResponse.json({ 
          success: true, 
          message: 'Event ignored',
          event_type: eventType 
        })
    }
    
  } catch (error) {
    console.error('[Email Webhook] Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

// Detectar tipo de evento según estructura del payload
function detectEventType(body: any): string {
  // SendGrid
  if (body.event) {
    const eventMap: Record<string, string> = {
      'open': 'email_open',
      'click': 'email_click',
      'bounce': 'email_bounce',
      'delivered': 'email_delivered',
      'processed': 'email_processed'
    }
    return eventMap[body.event] || body.event
  }
  
  // AWS SES
  if (body.eventType) {
    const eventMap: Record<string, string> = {
      'Open': 'email_open',
      'Click': 'email_click',
      'Bounce': 'email_bounce',
      'Delivery': 'email_delivered'
    }
    return eventMap[body.eventType] || body.eventType
  }
  
  // Mailgun / Postmark formato de reply
  if (body.Subject || body.subject || body['Reply-To']) {
    return 'email_reply'
  }
  
  // Detectar si es una respuesta por el contenido
  if (body.text || body.html || body.body || body['body-plain']) {
    return 'email_reply'
  }
  
  return 'unknown'
}

// Handler: Respuesta de email recibida
async function handleEmailReply(body: any, supabase: any) {
  try {
    // Extraer datos del email según formato del proveedor
    const emailData = extractEmailData(body)
    
    console.log('[Email Reply] Processing reply from:', emailData.from_email)
    console.log('[Email Reply] Subject:', emailData.subject)
    
    // 1. Buscar o crear contacto usando servicio unificado
    const result = await contactService.findOrCreate({
      email: emailData.from_email,
      source: 'email',
      name: emailData.from_name || emailData.from_email.split('@')[0],
      metadata: {
        source_detail: 'email_reply',
        original_subject: emailData.subject
      }
    })
    
    const contact = result.contact
    
    if (result.is_new) {
      console.log('[Email Reply] New contact created:', contact.id)
    } else {
      console.log('[Email Reply] Existing contact found:', contact.id)
    }
    
    // 2. Buscar el mensaje original (si hay message_id en headers)
    let originalMessageId = null
    let campaignId = null
    
    if (emailData.headers) {
      // Buscar X-Message-ID o similar
      const messageIdHeader = emailData.headers.find(
        (h: any) => h.name === 'X-Message-ID' || h.name === 'X-Campaign-ID'
      )
      if (messageIdHeader) {
        originalMessageId = messageIdHeader.value
      }
    }
    
    // Buscar en in-reply-to o references
    if (!originalMessageId && emailData.in_reply_to) {
      const { data: originalMsg } = await supabase
        .from('unified_messages')
        .select('id, campaign_id')
        .eq('external_message_id', emailData.in_reply_to)
        .maybeSingle()
      
      if (originalMsg) {
        originalMessageId = originalMsg.id
        campaignId = originalMsg.campaign_id
      }
    }
    
    // 3. Guardar mensaje recibido en unified_messages
    const { data: message, error: messageError } = await supabase
      .from('unified_messages')
      .insert({
        channel_type: 'email',
        direction: 'inbound',
        contact_id: contact.id,
        contact_name: emailData.from_name || contact.first_name,
        contact_email: emailData.from_email,
        external_message_id: emailData.message_id,
        external_sender_id: emailData.from_email,
        external_sender_name: emailData.from_name,
        message_type: 'text',
        content: emailData.text || emailData.html,
        content_html: emailData.html,
        metadata: {
          original_subject: emailData.subject,
          to: emailData.to,
          in_reply_to: emailData.in_reply_to,
          references: emailData.references,
          headers: emailData.headers,
          campaign_id: campaignId,
          email_provider: 'inbound'
        },
        status: 'received',
        priority: 'medium',
        received_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (messageError) throw messageError
    
    // 4. Actualizar conversación
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .upsert({
        contact_id: contact.id,
        channel_id: null,
        subject: emailData.subject,
        status: 'active',
        last_message_at: new Date().toISOString(),
        last_message_preview: (emailData.text || emailData.html || '').substring(0, 100),
        last_message_direction: 'inbound',
        unread_count: supabase.rpc('increment_unread_count', { 
          contact_id: contact.id,
          channel_id: null 
        })
      }, {
        onConflict: 'contact_id,channel_id'
      })
      .select()
      .single()
    
    if (convError && convError.code !== '23505') {
      console.error('[Email Reply] Error updating conversation:', convError)
    }
    
    // 5. Actualizar contador de interacciones del contacto
    await supabase
      .from('contacts')
      .update({
        last_interaction_at: new Date().toISOString(),
        interaction_count: supabase.rpc('increment_interaction_count', { contact_id: contact.id })
      })
      .eq('id', contact.id)
    
    // 6. Si venía de una campaña, actualizar estadísticas
    if (campaignId) {
      await supabase.rpc('increment_campaign_reply_count', {
        campaign_id: campaignId
      })
    }
    
    // 7. Notificar a OpenClaw si está configurado
    await notifyOpenClaw({
      event: 'conversation.message',
      contact,
      message,
      conversation
    })
    
    return NextResponse.json({
      success: true,
      event: 'email_reply',
      contact_id: contact.id,
      message_id: message.id,
      conversation_id: conversation?.id,
      is_new_contact: !contact.created_at
    })
    
  } catch (error) {
    console.error('[Email Reply] Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

// Handler: Email abierto
async function handleEmailOpen(body: any, supabase: any) {
  const { message_id, email } = extractTrackingData(body)
  
  if (message_id) {
    await supabase
      .from('unified_messages')
      .update({
        status: 'read',
        read_at: new Date().toISOString(),
        metadata: {
          opened_at: new Date().toISOString(),
          open_count: supabase.rpc('increment_open_count', { message_id })
        }
      })
      .eq('id', message_id)
  }
  
  return NextResponse.json({ success: true, event: 'email_open' })
}

// Handler: Click en email
async function handleEmailClick(body: any, supabase: any) {
  const { message_id, url } = extractTrackingData(body)
  
  if (message_id) {
    await supabase
      .from('unified_messages')
      .update({
        metadata: {
          clicked_at: new Date().toISOString(),
          clicked_url: url,
          click_count: supabase.rpc('increment_click_count', { message_id })
        }
      })
      .eq('id', message_id)
  }
  
  return NextResponse.json({ success: true, event: 'email_click' })
}

// Handler: Bounce
async function handleEmailBounce(body: any, supabase: any) {
  const { message_id, email, reason } = extractTrackingData(body)
  
  if (message_id) {
    await supabase
      .from('unified_messages')
      .update({
        status: 'failed',
        metadata: {
          bounce_reason: reason,
          bounced_at: new Date().toISOString()
        }
      })
      .eq('id', message_id)
  }
  
  // Marcar contacto con email inválido
  if (email) {
    await supabase
      .from('contacts')
      .update({
        status: 'blocked',
        metadata: {
          email_invalid: true,
          bounce_reason: reason
        }
      })
      .ilike('email', email)
  }
  
  return NextResponse.json({ success: true, event: 'email_bounce' })
}

// Extraer datos de email según formato
function extractEmailData(body: any) {
  // SendGrid Inbound
  if (body.envelope) {
    return {
      from_email: body.envelope.from,
      to: body.envelope.to,
      subject: body.subject,
      text: body.text,
      html: body.html,
      headers: body.headers,
      message_id: body.headers?.find((h: any) => h.name === 'Message-ID')?.value,
      in_reply_to: body.headers?.find((h: any) => h.name === 'In-Reply-To')?.value,
      references: body.headers?.find((h: any) => h.name === 'References')?.value,
      from_name: body.from
    }
  }
  
  // Mailgun
  if (body['body-plain'] || body['body-html']) {
    return {
      from_email: body.sender,
      to: body.recipient,
      subject: body.subject,
      text: body['body-plain'],
      html: body['body-html'],
      message_id: body['Message-Id'],
      from_name: body.from
    }
  }
  
  // Postmark
  if (body.From) {
    return {
      from_email: body.From,
      to: body.To,
      subject: body.Subject,
      text: body.TextBody,
      html: body.HtmlBody,
      message_id: body.MessageID,
      from_name: body.FromName
    }
  }
  
  // Formato genérico
  return {
    from_email: body.from || body.from_email || body.sender,
    to: body.to || body.recipient,
    subject: body.subject,
    text: body.text || body.body || body['body-plain'],
    html: body.html || body['body-html'],
    message_id: body.message_id || body['Message-ID'],
    in_reply_to: body.in_reply_to || body['In-Reply-To'],
    from_name: body.from_name || body.from
  }
}

// Extraer datos de tracking
function extractTrackingData(body: any) {
  return {
    message_id: body.message_id || body['X-Message-ID'] || body.sg_message_id,
    email: body.email,
    url: body.url,
    reason: body.reason || body.bounce_reason || body.response
  }
}

// Notificar a OpenClaw
async function notifyOpenClaw(data: any) {
  const OPENCLAW_WEBHOOK = process.env.OPENCLAW_CRM_WEBHOOK_URL
  
  if (!OPENCLAW_WEBHOOK) {
    console.log('[OpenClaw] No webhook configured, skipping notification')
    return
  }
  
  try {
    const response = await fetch(OPENCLAW_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      console.error('[OpenClaw] Failed to notify:', await response.text())
    }
  } catch (error) {
    console.error('[OpenClaw] Error notifying:', error)
  }
}
