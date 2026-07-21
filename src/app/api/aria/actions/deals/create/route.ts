import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAriaAuth, logAriaAction } from '@/lib/aria-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'
import { recordActivity } from '@/lib/activity-log'

/**
 * POST /api/aria/actions/deals/create
 *
 * Put a qualified lead into a product pipeline as a deal — the missing
 * primitive that lets any agent (n8n bot, acquisition machine) push a
 * prospect into the funnel end-to-end:
 *
 *   leads/create → deals/create (here) → deals/move → deals/checkout
 *
 * Resolves, in one call:
 *  - the contact: by `contact_id`, else find-or-create by email/phone.
 *  - the pipeline: by `pipeline_id`, else `product_slug` → product.default_pipeline_id.
 *  - the entry stage: by `stage_name`, else the pipeline's first active stage.
 *  - the org: inherited from the contact, else the primary organization.
 */

const bodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(), // deal name; auto-composed if omitted

    // contact — provide contact_id OR enough to find/create one
    contact_id: z.string().uuid().optional(),
    first_name: z.string().max(100).optional(),
    last_name: z.string().max(100).optional().default(''),
    email: z.string().email().max(200).optional().nullable(),
    phone: z.string().max(50).optional().nullable(),
    company_name: z.string().max(200).optional().nullable(),

    // pipeline — provide pipeline_id OR product_slug
    pipeline_id: z.string().uuid().optional(),
    product_slug: z.string().max(80).optional(),
    stage_name: z.string().max(100).optional(),

    // deal fields
    value: z.coerce.number().min(0).max(1_000_000_000).optional().default(0),
    currency: z.enum(['USD', 'COP', 'EUR', 'MXN', 'BRL']).optional().default('COP'),
    probability: z.coerce.number().int().min(0).max(100).optional(),
    description: z.string().max(2000).optional().nullable(),
    lead_id: z.string().uuid().optional().nullable(),
    source: z.string().max(80).optional().default('agent'),
  })
  .refine((v) => v.contact_id || v.email || v.phone || v.first_name, {
    message: 'Se requiere contact_id, o al menos first_name/email/phone para crear el contacto',
  })
  .refine((v) => v.pipeline_id || v.product_slug, {
    message: 'Se requiere pipeline_id o product_slug',
  })

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'aria-deal-create' })
  if (block) return block

  const auth = requireAriaAuth(request)
  if (auth.error) return auth.error

  let b: z.infer<typeof bodySchema>
  try {
    b = bodySchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  try {
    // 1) Resolve pipeline (+ product)
    let pipelineId = b.pipeline_id ?? null
    let productId: string | null = null
    let productName: string | null = null

    if (!pipelineId && b.product_slug) {
      const { data: prod } = await supabase
        .from('products')
        .select('id, name, default_pipeline_id')
        .eq('slug', b.product_slug)
        .maybeSingle()
      if (!prod) {
        return NextResponse.json({ error: `Producto '${b.product_slug}' no existe` }, { status: 404 })
      }
      const p = prod as { id: string; name: string; default_pipeline_id: string | null }
      pipelineId = p.default_pipeline_id
      productId = p.id
      productName = p.name
      if (!pipelineId) {
        return NextResponse.json(
          { error: `El producto '${b.product_slug}' no tiene pipeline por defecto` },
          { status: 409 },
        )
      }
    } else if (pipelineId) {
      const { data: pl } = await supabase
        .from('pipelines')
        .select('product_id')
        .eq('id', pipelineId)
        .maybeSingle()
      productId = (pl as { product_id: string | null } | null)?.product_id ?? null
    }

    // 2) Resolve the entry stage (explicit name, else first active by order)
    type Stage = { id: string; name: string; default_probability: number }
    let stage: Stage | null = null
    if (b.stage_name) {
      const { data } = await supabase
        .from('pipeline_stages')
        .select('id, name, default_probability')
        .eq('pipeline_id', pipelineId)
        .ilike('name', `%${b.stage_name}%`)
        .eq('is_active', true)
        .limit(1)
      stage = (Array.isArray(data) ? data[0] : data) as Stage | null
    }
    if (!stage) {
      const { data } = await supabase
        .from('pipeline_stages')
        .select('id, name, default_probability')
        .eq('pipeline_id', pipelineId)
        .eq('is_active', true)
        .order('order_index', { ascending: true })
        .limit(1)
      stage = (Array.isArray(data) ? data[0] : data) as Stage | null
    }
    if (!stage) {
      return NextResponse.json({ error: 'El pipeline no tiene etapas activas' }, { status: 409 })
    }

    // 3) Resolve the contact (by id, else find-or-create by email/phone)
    let contactId = b.contact_id ?? null
    let contactOrgId: string | null = null

    if (contactId) {
      const { data } = await supabase.from('contacts').select('org_id').eq('id', contactId).maybeSingle()
      contactOrgId = (data as { org_id: string | null } | null)?.org_id ?? null
    } else {
      let found: { id: string; org_id: string | null } | null = null
      if (b.email) {
        const { data } = await supabase.from('contacts').select('id, org_id').eq('email', b.email).limit(1)
        found = (Array.isArray(data) ? data[0] : data) as typeof found
      }
      if (!found && b.phone) {
        const { data } = await supabase.from('contacts').select('id, org_id').eq('phone', b.phone).limit(1)
        found = (Array.isArray(data) ? data[0] : data) as typeof found
      }
      if (found) {
        contactId = found.id
        contactOrgId = found.org_id ?? null
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: created, error: cErr } = await (supabase.from('contacts') as any)
          .insert({
            first_name: b.first_name ?? b.company_name ?? 'Prospecto',
            last_name: b.last_name ?? '',
            email: b.email ?? null,
            phone: b.phone ?? null,
            company_name: b.company_name ?? null,
            type: 'lead',
            source: 'openclaw',
            product_id: productId,
          })
          .select('id, org_id')
          .single()
        if (cErr) throw new Error(`No se pudo crear el contacto: ${cErr.message}`)
        contactId = created.id
        contactOrgId = created.org_id ?? null
      }
    }

    // 4) Resolve org (contact's, else the primary organization)
    let orgId = contactOrgId
    if (!orgId) {
      const { data } = await supabase.from('organizations').select('id').limit(1)
      orgId = ((Array.isArray(data) ? data[0] : data) as { id: string } | null)?.id ?? null
    }

    // 5) Insert the deal
    const dealName = b.name ?? `${productName ?? 'Deal'} — ${b.company_name ?? b.first_name ?? 'prospecto'}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: deal, error } = await (supabase.from('deals') as any)
      .insert({
        name: dealName,
        contact_id: contactId,
        description: b.description ?? null,
        pipeline_id: pipelineId,
        stage_id: stage.id,
        product_id: productId,
        value: b.value,
        currency: b.currency,
        probability: b.probability ?? stage.default_probability,
        status: 'open',
        source: b.source,
        org_id: orgId,
        custom_fields: { lead_id: b.lead_id ?? null, product_slug: b.product_slug ?? null },
      })
      .select('id, name, value, currency, stage_id, pipeline_id')
      .single()

    if (error) throw new Error(error.message)

    // 6) Audit trail
    if (deal?.id) {
      recordActivity(supabase, {
        contact_id: contactId!,
        deal_id: deal.id,
        activity_type: 'deal_created',
        title: `Deal creado por agente: ${dealName}`,
        description: b.description ?? null,
        metadata: {
          source: 'aria',
          stage: stage.name,
          product: b.product_slug ?? productName,
          value: b.value,
          currency: b.currency,
          lead_id: b.lead_id ?? null,
        },
      })
    }

    logAriaAction('deals.create', { name: dealName, product: b.product_slug, value: b.value }, 'ok')
    return NextResponse.json({
      ok: true,
      deal,
      contact_id: contactId,
      stage: { id: stage.id, name: stage.name },
      message: `Deal "${dealName}" creado en "${stage.name}" (${b.value} ${b.currency})`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    logAriaAction('deals.create', { name: b.name, product: b.product_slug }, 'error', msg)
    return NextResponse.json({ error: 'Create failed', details: msg }, { status: 500 })
  }
}
