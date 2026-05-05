// @ts-nocheck
import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'

// POST /api/campaigns/email - Enviar campaña de correos
export async function POST(request: Request) {
  // 🔐 Email campaigns can only be triggered by an authenticated user
  const auth = await requireAuth()
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { 
      contact_ids, // Array de UUIDs de contacts
      subject, 
      content, 
      from_name = 'Agencia Invent',
      from_email = 'contacto@agenciainvent.com',
      track_opens = true,
      track_clicks = true,
      template_id,
      metadata = {}
    } = body

    if (!contact_ids || !Array.isArray(contact_ids) || contact_ids.length === 0) {
      return NextResponse.json(
        { error: 'contact_ids array is required' },
        { status: 400 }
      )
    }

    if (!subject || !content) {
      return NextResponse.json(
        { error: 'subject and content are required' },
        { status: 400 }
      )
    }

    const supabase = getServiceRoleClient()
    const results = []
    const errors = []

    // 1. Obtener información de los contactos
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company_name')
      .in('id', contact_ids)

    if (contactsError) {
      throw new Error(`Error fetching contacts: ${contactsError.message}`)
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json(
        { error: 'No contacts found with provided IDs' },
        { status: 404 }
      )
    }

    // 2. Crear campaña
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        name: `Campaña Email - ${subject}`,
        type: 'email',
        status: 'sending',
        subject,
        content,
        from_name,
        from_email,
        total_recipients: contacts.length,
        metadata: {
          track_opens,
          track_clicks,
          ...metadata
        }
      })
      .select()
      .single()

    if (campaignError) {
      throw new Error(`Error creating campaign: ${campaignError.message}`)
    }

    // 3. Enviar correos y crear registros
    for (const contact of contacts) {
      try {
        if (!contact.email) {
          errors.push({ contact_id: contact.id, error: 'No email address' })
          continue
        }

        // Personalizar contenido
        const personalizedContent = content
          .replace(/{{first_name}}/g, contact.first_name || 'Estimado')
          .replace(/{{last_name}}/g, contact.last_name || '')
          .replace(/{{company}}/g, contact.company_name || 'su empresa')
          .replace(/{{email}}/g, contact.email)

        const personalizedSubject = subject
          .replace(/{{first_name}}/g, contact.first_name || 'Estimado')
          .replace(/{{last_name}}/g, contact.last_name || '')
          .replace(/{{company}}/g, contact.company_name || 'su empresa')

        // Crear registro de mensaje en unified_messages
        const { data: message, error: messageError } = await supabase
          .from('unified_messages')
          .insert({
            channel_type: 'email',
            direction: 'outbound',
            contact_id: contact.id,
            contact_name: `${contact.first_name} ${contact.last_name}`.trim(),
            contact_email: contact.email,
            message_type: 'text',
            content: personalizedContent,
            subject: personalizedSubject,
            status: 'sent',
            priority: 'medium',
            metadata: {
              campaign_id: campaign.id,
              track_opens,
              track_clicks,
              from_name,
              from_email
            }
          })
          .select()
          .single()

        if (messageError) throw messageError

        // Crear o actualizar conversación
        const { data: conversation, error: convError } = await supabase
          .from('conversations')
          .upsert({
            contact_id: contact.id,
            channel_id: null, // Email no tiene channel específico
            subject: personalizedSubject,
            status: 'active',
            last_message_at: new Date().toISOString(),
            last_message_preview: personalizedContent.substring(0, 100),
            last_message_direction: 'outbound',
            message_count: 1,
            unread_count: 0
          }, {
            onConflict: 'contact_id,channel_id',
            ignoreDuplicates: false
          })
          .select()
          .single()

        if (convError && convError.code !== '23505') {
          console.error('Error creating conversation:', convError)
        }

        // Actualizar contador de interacciones del contacto
        await supabase
          .from('contacts')
          .update({
            interaction_count: supabase.rpc('increment_interaction_count', { contact_id: contact.id }),
            last_interaction_at: new Date().toISOString()
          })
          .eq('id', contact.id)

        // Aquí integrarías tu proveedor de email (SendGrid, AWS SES, etc.)
        // Por ahora simulamos el envío
        const emailSent = await sendEmailProvider({
          to: contact.email,
          subject: personalizedSubject,
          content: personalizedContent,
          from_name,
          from_email,
          message_id: message.id,
          campaign_id: campaign.id
        })

        results.push({
          contact_id: contact.id,
          email: contact.email,
          message_id: message.id,
          status: 'sent',
          conversation_id: conversation?.id
        })

      } catch (error) {
        console.error(`Error sending to ${contact.email}:`, error)
        errors.push({
          contact_id: contact.id,
          email: contact.email,
          error: error.message
        })
      }
    }

    // 4. Actualizar estado de campaña
    await supabase
      .from('campaigns')
      .update({
        status: errors.length === 0 ? 'sent' : 'partial',
        sent_count: results.length,
        error_count: errors.length,
        completed_at: new Date().toISOString()
      })
      .eq('id', campaign.id)

    return NextResponse.json({
      success: true,
      campaign_id: campaign.id,
      total: contacts.length,
      sent: results.length,
      errors: errors.length,
      results,
      error_details: errors
    })

  } catch (error) {
    console.error('[Email Campaign] Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

// Función mock para envío de email (reemplazar con tu proveedor)
async function sendEmailProvider(params: {
  to: string
  subject: string
  content: string
  from_name: string
  from_email: string
  message_id: string
  campaign_id: string
}) {
  // TODO: Integrar con SendGrid, AWS SES, Mailgun, etc.
  // Ejemplo con SendGrid:
  // const sgMail = require('@sendgrid/mail')
  // sgMail.setApiKey(process.env.SENDGRID_API_KEY)
  // await sgMail.send({
  //   to: params.to,
  //   from: { email: params.from_email, name: params.from_name },
  //   subject: params.subject,
  //   html: params.content,
  //   customArgs: {
  //     message_id: params.message_id,
  //     campaign_id: params.campaign_id
  //   }
  // })

  console.log('[Email Provider] Simulating send to:', params.to)
  return { success: true, provider_message_id: `mock_${Date.now()}` }
}

// GET /api/campaigns/email - Listar campañas
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    
    const supabase = getServiceRoleClient()
    
    let query = supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    
    if (status) {
      query = query.eq('status', status)
    }
    
    const { data: campaigns, error } = await query
    
    if (error) throw error
    
    return NextResponse.json({ campaigns })
    
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
