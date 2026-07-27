import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireOrg } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET    /api/products/[slug]  full product + its pipeline + stages
 * PATCH  /api/products/[slug]  update product fields
 * DELETE /api/products/[slug]  hard delete (cascade pipelines via FK)
 *
 * Slug is the URL identifier so users can write /pipeline?product=foody
 * without knowing the UUID. UUID is internal.
 */

const productPatchSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    tagline: z.string().max(200).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    target_market: z.string().max(300).nullable().optional(),
    price_model: z.string().max(120).nullable().optional(),
    status: z.enum(['active', 'beta', 'idea', 'paused', 'archived']).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    icon: z.string().max(40).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' })

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const org = await requireOrg()
  if (org.error) return org.error

  const supabase = getServiceRoleClient()
  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('*')
    .eq('slug', params.slug)
    .single()

  if (pErr || !product) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Pull pipelines + stages so the product detail page can render
  // the full structure in one request.
  const { data: pipelines } = await supabase
    .from('pipelines')
    .select('id, name, is_default, is_active')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq('product_id', (product as any).id)
    .eq('org_id', org.orgId)

  let stages: unknown[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const defaultPip = (pipelines || []).find((p: any) => p.is_default)
  if (defaultPip) {
    const { data: s } = await supabase
      .from('pipeline_stages')
      .select('id, name, default_probability, order_index, color, is_active')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq('pipeline_id', (defaultPip as any).id)
      .eq('org_id', org.orgId)
      .order('order_index')
    stages = s || []
  }

  return NextResponse.json({
    ok: true,
    product,
    pipelines: pipelines || [],
    default_stages: stages,
  })
}

export async function PATCH(request: Request, { params }: { params: { slug: string } }) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'products-patch' })
  if (block) return block

  const auth = await requireAuth()
  if (auth.error) return auth.error

  let parsed: z.infer<typeof productPatchSchema>
  try {
    parsed = productPatchSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('products') as any)
    .update(parsed)
    .eq('slug', params.slug)
    .select('*')
    .single()

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, product: data })
}

export async function DELETE(request: Request, { params }: { params: { slug: string } }) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'products-delete' })
  if (block) return block

  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('products') as any).delete().eq('slug', params.slug)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
