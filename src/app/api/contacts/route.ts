import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOrg } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * POST /api/contacts
 *
 * Create a contact. Server-side validation via Zod, rate-limited to
 * 60/min per IP, requires authenticated user. The created_by field is
 * set from the session so we always know who created the row.
 *
 * Returns the inserted row with id + created_at so the client can
 * navigate to /contacts/[id] without a follow-up query.
 */

const contactCreateSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().max(100).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  mobile: z.string().max(50).optional().nullable(),
  type: z
    .enum(['lead', 'prospect', 'customer', 'partner', 'supplier', 'vendor', 'influencer', 'employee'])
    .optional()
    .default('lead'),
  status: z
    .enum(['active', 'inactive', 'archived', 'blocked'])
    .optional()
    .default('active'),
  job_title: z.string().max(200).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  company_name: z.string().max(200).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  website: z.string().url().max(500).optional().nullable().or(z.literal('')),
  linkedin_url: z.string().url().max(500).optional().nullable().or(z.literal('')),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  zip_code: z.string().max(20).optional().nullable(),
  lead_score: z.number().int().min(0).max(100).optional().default(0),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
  jung_archetype: z
    .enum([
      'hero_entrepreneur',
      'sage_conservative',
      'caregiver_stressed',
      'artist_specialist',
      'ruler_executive',
      'explorer_merchant',
    ])
    .optional()
    .nullable(),
  telegram_chat_id: z.string().max(100).optional().nullable(),
  whatsapp_number: z.string().max(50).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  tags: z.array(z.string().max(50)).max(50).optional(),
})

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'contacts-create' })
  if (block) return block

  const org = await requireOrg()
  if (org.error) return org.error

  let parsed: z.infer<typeof contactCreateSchema>
  try {
    parsed = contactCreateSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  // La ficha de cliente es compartida entre las marcas conectadas. Evitamos
  // crear otra persona en Yumk si ya existe en Invent (o viceversa).
  let existingContact: { id: string; first_name: string; last_name: string | null; org_id: string } | null = null
  if (parsed.email) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('contacts') as any)
      .select('id, first_name, last_name, org_id')
      .in('org_id', org.accessibleOrgIds)
      .ilike('email', parsed.email)
      .limit(1)
      .maybeSingle()
    existingContact = data ?? null
  }
  if (!existingContact && parsed.phone) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('contacts') as any)
      .select('id, first_name, last_name, org_id')
      .in('org_id', org.accessibleOrgIds)
      .eq('phone', parsed.phone)
      .limit(1)
      .maybeSingle()
    existingContact = data ?? null
  }

  if (existingContact) {
    return NextResponse.json({
      error: 'duplicate_contact',
      message: 'Este cliente ya existe en la red Invent × Yumk. Abrimos su ficha compartida.',
      contact: existingContact,
    }, { status: 409 })
  }

  // Coerce empty-string optional URLs to null so Postgres stores NULL,
  // not the literal empty string.
  const insert = {
    ...parsed,
    website: parsed.website || null,
    linkedin_url: parsed.linkedin_url || null,
    created_by: org.user.id,
    org_id: org.orgId,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('contacts') as any)
    .insert(insert)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, contact: data })
}
