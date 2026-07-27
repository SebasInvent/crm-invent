import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOrg } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET    /api/contacts/[id]   read full contact
 * PATCH  /api/contacts/[id]   update one or more fields
 * DELETE /api/contacts/[id]   archive (soft-delete by setting status='archived')
 *                             pass ?hard=true for permanent delete
 *
 * Auth required for all three. Server is the source of truth for
 * `updated_at` and `updated_by`.
 */

const contactPatchSchema = z
  .object({
    first_name: z.string().min(1).max(100).optional(),
    last_name: z.string().max(100).nullable().optional(),
    email: z.string().email().max(200).nullable().optional().or(z.literal('')),
    phone: z.string().max(50).nullable().optional(),
    mobile: z.string().max(50).nullable().optional(),
    type: z
      .enum([
        'lead',
        'prospect',
        'customer',
        'partner',
        'supplier',
        'vendor',
        'influencer',
        'employee',
      ])
      .optional(),
    status: z.enum(['active', 'inactive', 'archived', 'blocked']).optional(),
    job_title: z.string().max(200).nullable().optional(),
    department: z.string().max(100).nullable().optional(),
    company_name: z.string().max(200).nullable().optional(),
    industry: z.string().max(100).nullable().optional(),
    website: z.string().url().max(500).nullable().optional().or(z.literal('')),
    linkedin_url: z.string().url().max(500).nullable().optional().or(z.literal('')),
    address: z.string().max(500).nullable().optional(),
    city: z.string().max(100).nullable().optional(),
    state: z.string().max(100).nullable().optional(),
    country: z.string().max(100).nullable().optional(),
    zip_code: z.string().max(20).nullable().optional(),
    lead_score: z.number().int().min(0).max(100).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    jung_archetype: z
      .enum([
        'hero_entrepreneur',
        'sage_conservative',
        'caregiver_stressed',
        'artist_specialist',
        'ruler_executive',
        'explorer_merchant',
      ])
      .nullable()
      .optional(),
    telegram_chat_id: z.string().max(100).nullable().optional(),
    whatsapp_number: z.string().max(50).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    tags: z.array(z.string().max(50)).max(50).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' })

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const org = await requireOrg()
  if (org.error) return org.error
  if (!params.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('contacts_network_view')
    .select('*')
    .eq('id', params.id)
    .in('org_id', org.accessibleOrgIds)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, contact: data })
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'contacts-patch' })
  if (block) return block

  const org = await requireOrg()
  if (org.error) return org.error
  if (!params.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  let parsed: z.infer<typeof contactPatchSchema>
  try {
    parsed = contactPatchSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  // Empty-string URL fields → NULL, never store empty strings.
  const patch: Record<string, unknown> = { ...parsed }
  if (patch.website === '') patch.website = null
  if (patch.linkedin_url === '') patch.linkedin_url = null
  if (patch.email === '') patch.email = null
  patch.updated_at = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('contacts') as any)
    .update(patch)
    .eq('id', params.id)
    .in('org_id', org.accessibleOrgIds)
    .select('*')
    .single()

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, contact: data })
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'contacts-delete' })
  if (block) return block

  const org = await requireOrg()
  if (org.error) return org.error
  if (!params.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const url = new URL(request.url)
  const hard = url.searchParams.get('hard') === 'true'

  const supabase = getServiceRoleClient()

  if (hard) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('contacts') as any)
      .delete()
      .eq('id', params.id)
      .in('org_id', org.accessibleOrgIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: 'hard' })
  }

  // Default: soft-delete via status flip
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('contacts') as any)
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .in('org_id', org.accessibleOrgIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, deleted: 'soft' })
}
