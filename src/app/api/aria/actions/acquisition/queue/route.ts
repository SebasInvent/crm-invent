import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAriaAuth, logAriaAction } from '@/lib/aria-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

const querySchema = z.object({
  product_slug: z.enum(['tickean', 'encore']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  min_score: z.coerce.number().int().min(0).max(100).default(60),
})

const fakeEmail = (value: unknown) => {
  const email = String(value ?? '').toLowerCase()
  return !email.includes('@') || email.startsWith('sin-email+') || email.endsWith('@temp.com')
}
const extractAuthorization = (notes: unknown) => {
  const match = String(notes ?? '').match(/Autorizaci[oó]n(?: de canal)?:\s*(opt_in|corporate_business|unknown|do_not_contact)/i)
  return (match?.[1]?.toLowerCase() ?? 'unknown') as 'opt_in' | 'corporate_business' | 'unknown' | 'do_not_contact'
}
const touchNumber = (tags: string[]) => tags.reduce((max, tag) => {
  const match = tag.match(/^touch-(\d+)$/)
  return match ? Math.max(max, Number(match[1])) : max
}, 0)

export async function GET(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'aria-acquisition-queue' })
  if (block) return block
  const auth = requireAriaAuth(request)
  if (auth.error) return auth.error
  const url = new URL(request.url)
  let parsed: z.infer<typeof querySchema>
  try {
    parsed = querySchema.parse({
      product_slug: url.searchParams.get('product_slug') || undefined,
      limit: url.searchParams.get('limit') ?? 25,
      min_score: url.searchParams.get('min_score') ?? 60,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid query', details: error instanceof Error ? error.message : 'parse failed' }, { status: 400 })
  }

  const supabase = getServiceRoleClient()
  try {
    const [{ data: products, error: productError }, { data: deals, error: dealError }] = await Promise.all([
      supabase.from('products').select('id, slug, name'),
      supabase.from('deals').select('id, contact_id, product_id, status, custom_fields').eq('status', 'open').limit(1000),
    ])
    if (productError) throw new Error(productError.message)
    if (dealError) throw new Error(dealError.message)
    const productRows = (products ?? []) as Array<{ id: string; slug: string; name: string }>
    const dealRows = (deals ?? []) as Array<{ id: string; custom_fields: unknown }>
    const productById = new Map(productRows.map((product) => [product.id, product]))
    const dealByLeadId = new Map<string, string>()
    for (const deal of dealRows) {
      const customFields = deal.custom_fields && typeof deal.custom_fields === 'object'
        ? deal.custom_fields as Record<string, unknown>
        : {}
      const leadId = typeof customFields.lead_id === 'string' ? customFields.lead_id : null
      if (leadId) dealByLeadId.set(leadId, deal.id)
    }
    let query = supabase
      .from('leads')
      .select('id, name, email, phone, company, lead_status, lead_score, priority, source, source_platform, location, tags, notes, product_id, created_at, updated_at')
      .neq('lead_status', 'dead')
      .neq('lead_status', 'converted')
      .gte('lead_score', parsed.min_score)
      .order('lead_score', { ascending: false })
      .limit(500)
    if (parsed.product_slug) {
      const product = productRows.find((row) => row.slug === parsed.product_slug)
      if (!product) return NextResponse.json({ error: `Producto '${parsed.product_slug}' no existe` }, { status: 404 })
      query = query.eq('product_id', product.id)
    }
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const now = Date.now()
    const queue = (data ?? []).map((lead: any) => {
      const tags = Array.isArray(lead.tags) ? lead.tags : []
      const touch = touchNumber(tags)
      const authorization = extractAuthorization(lead.notes)
      const hasPhone = String(lead.phone ?? '').replace(/\D/g, '').length >= 10
      const hasEmail = !fakeEmail(lead.email)
      const product = productById.get(lead.product_id) as any
      const ageHours = Math.max(0, (now - new Date(lead.updated_at ?? lead.created_at).getTime()) / 3600000)
      const nextTouch = touch === 0 ? 1 : touch + 1
      const dueHours = touch === 0 ? 0 : touch === 1 ? 48 : touch === 2 ? 72 : touch === 3 ? 120 : Infinity
      const action = touch === 0 ? 'first_contact' : touch === 1 ? 'followup_day_2' : touch === 2 ? 'followup_day_5' : touch === 3 ? 'close_loop_day_10' : 'nurture'
      let channel = hasPhone ? 'whatsapp' : hasEmail ? 'email' : 'manual'
      if (tags.includes('do-not-contact') || authorization === 'do_not_contact') channel = 'suppressed'
      const authorized = authorization === 'opt_in' || authorization === 'corporate_business'
      const autoEligible = channel === 'email'
        ? authorized
        : channel === 'whatsapp'
          ? authorized && action === 'first_contact'
          : false
      const blockReason = channel === 'suppressed'
        ? 'do_not_contact'
        : !authorized
          ? 'authorization_required'
          : channel === 'manual'
            ? 'no_direct_channel'
            : channel === 'whatsapp' && action !== 'first_contact'
              ? 'approved_followup_template_required'
              : null
      return {
        ...lead,
        deal_id: dealByLeadId.get(lead.id) ?? null,
        product_slug: product?.slug ?? null,
        contact_authorization: authorization,
        current_touch: touch,
        next_touch: nextTouch,
        next_action: action,
        due: ageHours >= dueHours,
        age_hours: Math.round(ageHours),
        recommended_channel: channel,
        auto_eligible: autoEligible,
        block_reason: blockReason,
      }
    })
      .filter((lead: any) => lead.due && lead.next_action !== 'nurture')
      .sort((a: any, b: any) => Number(b.auto_eligible) - Number(a.auto_eligible) || b.lead_score - a.lead_score || b.age_hours - a.age_hours)
      .slice(0, parsed.limit)

    const summary = {
      total: queue.length,
      auto_eligible: queue.filter((lead: any) => lead.auto_eligible).length,
      manual: queue.filter((lead: any) => !lead.auto_eligible && !lead.block_reason?.includes('do_not_contact')).length,
      suppressed: queue.filter((lead: any) => lead.block_reason === 'do_not_contact').length,
      by_product: queue.reduce<Record<string, number>>((acc, lead: any) => {
        const slug = lead.product_slug ?? 'sin_producto'
        acc[slug] = (acc[slug] ?? 0) + 1
        return acc
      }, {}),
    }
    logAriaAction('acquisition.queue', parsed, 'ok')
    return NextResponse.json({ ok: true, generated_at: new Date().toISOString(), criteria: parsed, summary, queue })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    logAriaAction('acquisition.queue', parsed, 'error', message)
    return NextResponse.json({ error: 'Queue failed', details: message }, { status: 500 })
  }
}
