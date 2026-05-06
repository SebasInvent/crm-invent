import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET  /api/products      list all products (any status)
 * POST /api/products      create a new product
 *
 * Each Invent vertical (Dental OS, Foody, Veralix, Mowi, El Sonar,
 * The iOS Bogotá, Buna Market, Custom) is a row here. The seed in
 * migrations/007 inserts the initial 8; this endpoint lets you add,
 * rename, or change pricing/target market later.
 */

const productCreateSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'lowercase letters, numbers, dashes only'),
  name: z.string().min(1).max(120),
  tagline: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  target_market: z.string().max(300).optional().nullable(),
  price_model: z.string().max(120).optional().nullable(),
  status: z.enum(['active', 'beta', 'idea', 'paused', 'archived']).optional().default('idea'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .default('#71717a'),
  icon: z.string().max(40).optional().nullable(),
})

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('status') // active first
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, products: data ?? [] })
}

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'products-create' })
  if (block) return block

  const auth = await requireAuth()
  if (auth.error) return auth.error

  let parsed: z.infer<typeof productCreateSchema>
  try {
    parsed = productCreateSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('products') as any)
    .insert(parsed)
    .select('*')
    .single()

  if (error) {
    if (String(error.code) === '23505') {
      return NextResponse.json({ error: `Ya existe un producto con slug "${parsed.slug}"` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, product: data })
}
