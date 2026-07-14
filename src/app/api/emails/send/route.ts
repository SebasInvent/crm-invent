import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { z } from 'zod'
import { getServiceRoleClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'

// Validation schema for the send-email request body
const sendEmailSchema = z.object({
  to: z.string().email('Invalid recipient email'),
  template: z.enum(['deliverable_ready', 'task_assigned', 'custom']),
  data: z.record(z.unknown()).optional().default({}),
  // Para template 'custom' (respuestas libres desde el Inbox):
  subject: z.string().min(1).max(200).optional(),
  text: z.string().min(1).max(10000).optional(),
  client_id: z.string().uuid().optional().nullable(),
  deliverable_id: z.string().uuid().optional().nullable(),
})

/** Escapa HTML de input libre antes de inyectarlo en el template. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Template para mensajes libres (Inbox → email)
function getCustomEmailTemplate(data: { subject: string; text: string }) {
  return {
    subject: data.subject,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: 'Inter', -apple-system, sans-serif; background: #000; color: #fff; }
            .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
            .logo { width: 160px; margin-bottom: 30px; }
            p { line-height: 1.6; margin-bottom: 16px; white-space: pre-wrap; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #333; font-size: 14px; color: #888; }
          </style>
        </head>
        <body>
          <div class="container">
            <img src="https://www.inventagency.co/logo-white.png" alt="Invent Agency" class="logo" />
            <p>${escapeHtml(data.text).replace(/\n/g, '<br/>')}</p>
            <div class="footer"><p>Equipo Invent Agency · inventagency.co</p></div>
          </div>
        </body>
      </html>
    `,
  }
}

let resend: Resend | null = null

function getResendClient(): Resend {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not defined')
    }
    resend = new Resend(apiKey)
  }
  return resend
}

// Template para entregable listo
function getDeliverableEmailTemplate(data: {
  clientName: string
  deliverableTitle: string
  description?: string
  agentName: string
}) {
  return {
    subject: `Tu entregable está listo: ${data.deliverableTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: 'Inter', -apple-system, sans-serif; background: #000; color: #fff; }
            .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
            .logo { width: 180px; margin-bottom: 30px; }
            h1 { font-size: 24px; font-weight: 600; margin-bottom: 20px; }
            p { line-height: 1.6; margin-bottom: 16px; }
            .button {
              display: inline-block;
              background: #fff;
              color: #000;
              padding: 14px 28px;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 500;
              margin: 20px 0;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #333;
              font-size: 14px;
              color: #888;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <img src="https://www.inventagency.co/logo-white.png" alt="Invent Agency" class="logo" />
            <h1>Hola ${data.clientName},</h1>
            <p>Tu entregable <strong>"${data.deliverableTitle}"</strong> está listo.</p>
            ${data.description ? `<p>${data.description}</p>` : ''}
            <p>Nuestro equipo ha trabajado en esto con dedicación. Puedes descargarlo desde el portal de cliente.</p>
            <a href="https://clients.inventagency.co/dashboard" class="button">Ver entregable</a>
            <p style="margin-top: 30px;">¿Tienes preguntas? Responde a este email y te ayudamos.</p>
            <div class="footer">
              <p>Saludos,<br/>${data.agentName} y el equipo de Invent Agency</p>
            </div>
          </div>
        </body>
      </html>
    `
  }
}

// Template para tarea asignada a agente
function getTaskAssignedEmailTemplate(data: {
  agentName: string
  taskTitle: string
  taskDescription?: string
  priority: string
  clientName: string
}) {
  return {
    subject: `Nueva tarea asignada: ${data.taskTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: 'Inter', sans-serif; background: #000; color: #fff; }
            .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
            .logo { width: 140px; margin-bottom: 20px; }
            h1 { font-size: 22px; margin-bottom: 20px; }
            .priority { 
              display: inline-block;
              background: ${data.priority === 'high' ? '#ef4444' : data.priority === 'medium' ? '#f59e0b' : '#22c55e'};
              color: #000;
              padding: 4px 12px;
              border-radius: 4px;
              font-size: 12px;
              font-weight: 600;
              text-transform: uppercase;
              margin-bottom: 20px;
            }
            .details {
              background: #111;
              border: 1px solid #333;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <img src="https://www.inventagency.co/logo-white.png" alt="Invent Agency" class="logo" />
            <h1>Hola ${data.agentName},</h1>
            <p>Se te ha asignado una nueva tarea:</p>
            <span class="priority">Prioridad: ${data.priority}</span>
            <div class="details">
              <h3>${data.taskTitle}</h3>
              ${data.taskDescription ? `<p>${data.taskDescription}</p>` : ''}
              <p style="margin-top: 15px; font-size: 14px; color: #888;">
                Cliente: <strong>${data.clientName}</strong>
              </p>
            </div>
            <p>Entra al CRM para comenzar a trabajar en esto.</p>
          </div>
        </body>
      </html>
    `
  }
}

export async function POST(request: Request) {
  // 🔐 Auth — only authenticated users can send emails through this endpoint.
  const auth = await requireAuth()
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const parsed = sendEmailSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { to, template, data, subject, text, client_id, deliverable_id } = parsed.data

    const from = process.env.FROM_EMAIL || 'hola@inventagency.co'
    let emailContent: { subject: string; html: string }

    // Seleccionar template
    switch (template) {
      case 'deliverable_ready':
        emailContent = getDeliverableEmailTemplate(data as Parameters<typeof getDeliverableEmailTemplate>[0])
        break
      case 'task_assigned':
        emailContent = getTaskAssignedEmailTemplate(data as Parameters<typeof getTaskAssignedEmailTemplate>[0])
        break
      case 'custom':
        if (!subject || !text) {
          return NextResponse.json(
            { error: "template 'custom' requiere subject y text" },
            { status: 400 }
          )
        }
        emailContent = getCustomEmailTemplate({ subject, text })
        break
      default:
        return NextResponse.json(
          { error: `Template ${template} not found` },
          { status: 400 }
        )
    }

    // Enviar email
    const { data: sendData, error } = await getResendClient().emails.send({
      from,
      to,
      subject: emailContent.subject,
      html: emailContent.html,
    })

    if (error) {
      console.error('Error sending email:', error)
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: 500 }
      )
    }

    // Log en base de datos
    const supabase = getServiceRoleClient()
    const { error: logError } = await supabase
      .from('email_logs')
      .insert({
        client_id,
        to_email: to,
        subject: emailContent.subject,
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_by: auth.user.id,
      } as never)

    if (logError) {
      console.error('Error logging email:', logError)
    }

    // Si es entregable, marcar como enviado
    if (deliverable_id) {
      const { error: taskError } = await supabase
        .from('agent_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', deliverable_id)

      if (taskError) {
        console.error('Error updating task:', taskError)
      }
    }

    return NextResponse.json({
      success: true,
      messageId: sendData?.id,
    })
  } catch (error) {
    console.error('Error in email API:', error)
    const msg = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
