import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Resend } from 'resend'
import { requireOrg } from '@/lib/api-auth'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * /api/orgs/invites
 * GET  → invitaciones pendientes de la org activa.
 * POST → crea una invitación (owner/admin) y manda el email con el link.
 */
const createSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(['admin', 'member']).optional().default('member'),
})

export async function GET() {
  const org = await requireOrg()
  if (org.error) return org.error

  const svc = getServiceRoleClient()
  const { data, error } = await svc
    .from('organization_invites')
    .select('id, email, role, status, expires_at, created_at')
    .eq('org_id', org.orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invites: data ?? [] })
}

export async function POST(request: Request) {
  const org = await requireOrg()
  if (org.error) return org.error
  if (org.role !== 'owner' && org.role !== 'admin') {
    return NextResponse.json({ error: 'Solo owner/admin pueden invitar' }, { status: 403 })
  }

  let parsed: z.infer<typeof createSchema>
  try {
    parsed = createSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const svc = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invite, error } = await (svc.from('organization_invites') as any)
    .insert({ org_id: org.orgId, email: parsed.email, role: parsed.role, invited_by: org.user.id })
    .select('id, token, email, role')
    .single()
  if (error || !invite) return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })

  // Nombre de la org para el email.
  const { data: orgRow } = await svc.from('organizations').select('name').eq('id', org.orgId).single()
  const orgName = (orgRow as { name?: string } | null)?.name ?? 'un workspace'

  const baseUrl = new URL(request.url).origin
  const link = `${baseUrl}/invite/${invite.token}`

  // Envío best-effort (no falla la invitación si el email no sale).
  try {
    const apiKey = process.env.RESEND_API_KEY
    if (apiKey) {
      const resend = new Resend(apiKey)
      await resend.emails.send({
        from: process.env.FROM_EMAIL || 'hola@inventagency.co',
        to: parsed.email,
        subject: `Te invitaron a colaborar en ${orgName}`,
        html: `<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#09090b;color:#fff;padding:40px">
          <img src="https://www.inventagency.co/logo-white.png" style="height:30px;margin-bottom:24px"/>
          <h1 style="font-size:20px">Te invitaron a <strong>${orgName}</strong></h1>
          <p style="color:#a1a1aa">Únete al workspace en el CRM. La invitación vence en 7 días.</p>
          <a href="${link}" style="display:inline-block;background:#fff;color:#000;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:12px">Aceptar invitación</a>
          <p style="color:#71717a;font-size:12px;margin-top:20px">O copia este link: ${link}</p>
        </body></html>`,
      })
    }
  } catch {
    /* email best-effort */
  }

  return NextResponse.json({ ok: true, invite: { id: invite.id, email: invite.email, link } })
}
