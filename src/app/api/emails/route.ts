// @ts-nocheck
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getServiceRoleClient } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    // Initialize clients inside handler to avoid build-time errors
    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      )
    }
    const resend = new Resend(resendApiKey)

    const body = await request.json()
    const { to, subject, html, client_id } = body

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, html' },
        { status: 400 }
      )
    }

    const from = process.env.FROM_EMAIL || 'hola@inventagency.co'

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
    })

    if (error) {
      console.error('Error sending email:', error)
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: 500 }
      )
    }

    // Log email in database
    if (client_id) {
      try {
        const supabase = getServiceRoleClient()
        await supabase.from('email_logs').insert({
          client_id,
          to_email: to,
          subject,
          status: 'sent',
          sent_at: new Date().toISOString(),
        } as any)
      } catch (dbError) {
        console.error('Failed to log email:', dbError)
      }
    }

    return NextResponse.json(
      { success: true, data },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error in email API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
