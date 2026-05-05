import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAriaAuth, logAriaAction } from '@/lib/aria-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * POST /api/aria/actions/contacts/create
 *
 * Create a new contact. Aria uses this when the user says something
 * like "agrega a Juan Pérez de Empresa X, su email es juan@x.com".
 *
 * Body (JSON):
 *   first_name (required), last_name, email, phone, company_name,
 *   job_title, type (lead/prospect/customer/partner/supplier),
 *   source (manual/web_form/telegram/referral/linkedin), notes
 */

const bodySchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().max(100).optional().default(''),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  company_name: z.string().max(200).optional().nullable(),
  job_title: z.string().max(200).optional().nullable(),
  type: z.enum(['lead', 'prospect', 'customer', 'partner', 'supplier']).optional().default('lead'),
  source: z.enum(['manual', 'web_form', 'telegram', 'openclaw', 'referral', 'linkedin']).optional().default('manual'),
  notes: z.string().max(2000).optional().nullable(),
})

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 20, key: 'aria-contact-create' })
  if (block) return block

  const auth = requireAriaAuth(request)
  if (auth.error) return auth.error

  let parsed: z.infer<typeof bodySchema>
  try {
    const body = await request.json()
    parsed = bodySchema.parse(body)
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('contacts') as any)
      .insert(parsed)
      .select('id, first_name, last_name, email, type')
      .single()

    if (error) throw new Error(error.message)

    logAriaAction('contacts.create', parsed, 'ok')
    return NextResponse.json({
      ok: true,
      contact: data,
      message: `Contacto creado: ${parsed.first_name} ${parsed.last_name}`.trim(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    logAriaAction('contacts.create', parsed, 'error', msg)
    return NextResponse.json({ error: 'Create failed', details: msg }, { status: 500 })
  }
}
