import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAriaAuth, logAriaAction } from '@/lib/aria-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

const querySchema = z.object({
  product_slug: z.enum(['tickean', 'encore']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(250),
})

const bodySchema = querySchema.extend({ commit: z.boolean().default(false) })
const machineSource = /(maquina|machine|nightlife|sourcing|bright|scrap|gmaps|openclaw)/i
const testRecord = /(prueba|test|smoke|debug|borrar)/i
const nightlifeEvidence = /(nightlife|bar\b|cafe\b|club\b|discoteca|rooftop|pub\b|lounge|rumba|salsa|techno|rave|festival|evento|promotor|venue|teatro|concierto|boleter|ticket|dj\b|musica|cervecer|restaurante|gastro)/i

type Product = { id: string; slug: string; name: string }
type Contact = {
  id: string
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  company_name: string | null
  type: string
  status: string
  lead_score: number | null
  priority: string | null
  industry: string | null
  source: string | null
  source_details: Record<string, unknown> | null
  tags: string[] | null
  notes: string | null
  product_id: string | null
  created_at: string
  updated_at: string
}
type Deal = {
  id: string
  name: string
  contact_id: string | null
  description: string | null
  product_id: string | null
  status: string
  source: string | null
  probability: number | null
  custom_fields: Record<string, unknown> | null
  created_at: string
  updated_at: string
}
type Lead = {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  product_id: string | null
  tags: string[] | null
  notes: string | null
}

const normalize = (value: unknown) => String(value ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '')
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '')
const isRealEmail = (value: unknown) => {
  const email = String(value ?? '').toLowerCase()
  return email.includes('@') && !email.startsWith('sin-email+') && !email.endsWith('@temp.com')
}
const groupCount = (rows: Array<Record<string, unknown>>, key: string) => rows.reduce<Record<string, number>>((acc, row) => {
  const value = String(row[key] ?? 'sin_dato')
  acc[value] = (acc[value] ?? 0) + 1
  return acc
}, {})

async function loadInventory() {
  const supabase = getServiceRoleClient()
  const [productsRes, contactsRes, dealsRes, leadsRes] = await Promise.all([
    supabase.from('products').select('id, slug, name'),
    supabase.from('contacts').select('id, first_name, last_name, email, phone, company_name, type, status, lead_score, priority, industry, source, source_details, tags, notes, product_id, created_at, updated_at').in('type', ['lead', 'prospect']).limit(1000),
    supabase.from('deals').select('id, name, contact_id, description, product_id, status, source, probability, custom_fields, created_at, updated_at').limit(1000),
    supabase.from('leads').select('id, name, company, email, phone, product_id, tags, notes').limit(1000),
  ])
  for (const result of [productsRes, contactsRes, dealsRes, leadsRes]) {
    if (result.error) throw new Error(result.error.message)
  }
  return {
    supabase,
    products: (productsRes.data ?? []) as Product[],
    contacts: (contactsRes.data ?? []) as Contact[],
    deals: (dealsRes.data ?? []) as Deal[],
    leads: (leadsRes.data ?? []) as Lead[],
  }
}

function buildCandidates(inventory: Awaited<ReturnType<typeof loadInventory>>, params: z.infer<typeof querySchema>) {
  const productById = new Map(inventory.products.map((product) => [product.id, product]))
  const leadEmails = new Set(inventory.leads.filter((lead) => isRealEmail(lead.email)).map((lead) => String(lead.email).toLowerCase()))
  const leadPhones = new Set(inventory.leads.map((lead) => digits(lead.phone)).filter(Boolean))
  const leadNames = new Set(inventory.leads.map((lead) => `${lead.product_id ?? ''}:${normalize(lead.company || lead.name)}`))
  const dealsByContact = new Map<string, Deal[]>()
  for (const deal of inventory.deals) {
    if (!deal.contact_id) continue
    const rows = dealsByContact.get(deal.contact_id) ?? []
    rows.push(deal)
    dealsByContact.set(deal.contact_id, rows)
  }

  const candidates = []
  for (const contact of inventory.contacts) {
    const contactDeals = (dealsByContact.get(contact.id) ?? []).filter((deal) => deal.status === 'open')
    const machineDeals = contactDeals.filter((deal) => machineSource.test(String(deal.source ?? '')))
    const dealProductId = machineDeals.find((deal) => productById.has(String(deal.product_id)))?.product_id ?? null
    const productId = contact.product_id ?? dealProductId
    const product = productId ? productById.get(productId) : undefined
    const sourceIsMachine = machineSource.test(String(contact.source ?? '')) || machineDeals.length > 0
    const label = [contact.company_name, contact.first_name, contact.last_name].filter(Boolean).join(' ')
    const evidence = [
      label,
      contact.industry,
      contact.notes,
      JSON.stringify(contact.tags ?? []),
      JSON.stringify(contact.source_details ?? {}),
      ...machineDeals.flatMap((deal) => [deal.name, deal.description]),
    ].filter(Boolean).join(' ')
    const excludedReason = !product || !['tickean', 'encore'].includes(product.slug)
      ? 'sin_producto_tickean_encore'
      : !sourceIsMachine
        ? 'sin_fuente_n8n_brightdata'
        : !nightlifeEvidence.test(evidence)
          ? 'sin_evidencia_nightlife_eventos'
        : testRecord.test(label)
          ? 'registro_prueba'
          : contact.status === 'blocked' || contact.status === 'archived'
            ? 'contacto_bloqueado'
            : null
    if (params.product_slug && product?.slug !== params.product_slug) continue

    const email = isRealEmail(contact.email) ? String(contact.email).toLowerCase() : ''
    const phone = digits(contact.phone)
    const nameKey = `${productId ?? ''}:${normalize(contact.company_name || contact.first_name)}`
    const matched = (email && leadEmails.has(email)) || (phone && leadPhones.has(phone)) || leadNames.has(nameKey)
    candidates.push({
      contact,
      product: product ?? null,
      deals: machineDeals,
      excluded_reason: excludedReason,
      already_in_leads: Boolean(matched),
      contactability: phone ? 'whatsapp' : email ? 'email' : 'manual',
    })
  }
  return candidates.slice(0, params.limit)
}

export async function GET(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 20, key: 'aria-acquisition-inventory' })
  if (block) return block
  const auth = requireAriaAuth(request)
  if (auth.error) return auth.error
  const url = new URL(request.url)
  let parsed: z.infer<typeof querySchema>
  try {
    parsed = querySchema.parse({ product_slug: url.searchParams.get('product_slug') || undefined, limit: url.searchParams.get('limit') ?? 250 })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid query', details: error instanceof Error ? error.message : 'parse failed' }, { status: 400 })
  }
  try {
    const inventory = await loadInventory()
    const candidates = buildCandidates(inventory, parsed)
    const productById = new Map(inventory.products.map((product) => [product.id, product.slug]))
    const preview = candidates.map((candidate) => ({
      contact_id: candidate.contact.id,
      name: candidate.contact.company_name || [candidate.contact.first_name, candidate.contact.last_name].filter(Boolean).join(' '),
      email: isRealEmail(candidate.contact.email) ? candidate.contact.email : null,
      phone: candidate.contact.phone,
      source: candidate.contact.source,
      product_slug: candidate.product?.slug ?? null,
      deal_count: candidate.deals.length,
      already_in_leads: candidate.already_in_leads,
      excluded_reason: candidate.excluded_reason,
      contactability: candidate.contactability,
    }))
    const response = {
      ok: true,
      generated_at: new Date().toISOString(),
      summary: {
        contacts_total: inventory.contacts.length,
        contacts_by_type: groupCount(inventory.contacts as unknown as Array<Record<string, unknown>>, 'type'),
        contacts_by_source: groupCount(inventory.contacts as unknown as Array<Record<string, unknown>>, 'source'),
        deals_total: inventory.deals.length,
        deals_by_source: groupCount(inventory.deals as unknown as Array<Record<string, unknown>>, 'source'),
        leads_total: inventory.leads.length,
        leads_by_product: inventory.leads.reduce<Record<string, number>>((acc, lead) => {
          const slug = productById.get(String(lead.product_id)) ?? 'sin_producto'
          acc[slug] = (acc[slug] ?? 0) + 1
          return acc
        }, {}),
        historical_candidates: preview.filter((row) => !row.excluded_reason).length,
        missing_from_leads: preview.filter((row) => !row.excluded_reason && !row.already_in_leads).length,
        excluded: preview.filter((row) => row.excluded_reason).length,
      },
      candidates: preview,
    }
    logAriaAction('acquisition.inventory', parsed, 'ok')
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    logAriaAction('acquisition.inventory', parsed, 'error', message)
    return NextResponse.json({ error: 'Inventory failed', details: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 5, key: 'aria-acquisition-backfill' })
  if (block) return block
  const auth = requireAriaAuth(request)
  if (auth.error) return auth.error
  let parsed: z.infer<typeof bodySchema>
  try { parsed = bodySchema.parse(await request.json()) }
  catch (error) { return NextResponse.json({ error: 'Invalid body', details: error instanceof Error ? error.message : 'parse failed' }, { status: 400 }) }

  try {
    const inventory = await loadInventory()
    const candidates = buildCandidates(inventory, parsed).filter((candidate) => !candidate.excluded_reason && !candidate.already_in_leads)
    const plan = candidates.map((candidate) => ({
      contact_id: candidate.contact.id,
      name: candidate.contact.company_name || [candidate.contact.first_name, candidate.contact.last_name].filter(Boolean).join(' '),
      product_slug: candidate.product?.slug,
      source: candidate.contact.source,
      deal_ids: candidate.deals.map((deal) => deal.id),
      contactability: candidate.contactability,
    }))
    if (!parsed.commit) {
      logAriaAction('acquisition.backfill.preview', parsed, 'ok')
      return NextResponse.json({ ok: true, committed: false, count: plan.length, plan })
    }

    const created = []
    const failed = []
    for (const candidate of candidates) {
      const contact = candidate.contact
      const product = candidate.product!
      const rawName = contact.company_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Prospecto Nightlife'
      const fallbackEmail = `sin-email+backfill-${createHash('sha256').update(contact.id).digest('hex').slice(0, 12)}@inventagency.co`
      const descriptions = candidate.deals.map((deal) => deal.description).filter(Boolean).join(' | ')
      const score = Math.max(60, Math.min(100, Number(contact.lead_score) || Math.max(...candidate.deals.map((deal) => Number(deal.probability) || 0), 0)))
      const notes = [
        'Backfill histórico de automatizaciones n8n/Bright Data.',
        `Contacto CRM origen: ${contact.id}`,
        `Fuente contacto: ${contact.source ?? 'sin_dato'}`,
        `Deals origen: ${candidate.deals.map((deal) => deal.id).join(', ') || 'sin deal'}`,
        descriptions ? `Contexto: ${descriptions}` : null,
        contact.notes ? `Notas contacto: ${contact.notes}` : null,
        contact.source_details ? `Source details: ${JSON.stringify(contact.source_details)}` : null,
      ].filter(Boolean).join('\n').slice(0, 5000)
      const payload = {
        name: rawName.slice(0, 200),
        email: isRealEmail(contact.email) ? String(contact.email).slice(0, 200) : fallbackEmail,
        phone: contact.phone,
        company: contact.company_name ?? rawName,
        industry: contact.industry ?? 'Nightlife',
        lead_score: score,
        lead_status: 'cold',
        priority: score >= 75 ? 'high' : 'medium',
        source: 'scraped',
        source_platform: null,
        location: null,
        tags: Array.from(new Set([...(contact.tags ?? []), 'backfill-n8n', product.slug, 'esperando-clasificacion'])),
        notes,
        product_id: product.id,
      }
      const { data, error } = await (inventory.supabase.from('leads') as any)
        .insert(payload)
        .select('id, name, lead_score, priority, product_id')
        .single()
      if (error) failed.push({ contact_id: contact.id, name: rawName, error: error.message })
      else created.push(data)
    }
    logAriaAction('acquisition.backfill.commit', { ...parsed, created: created.length, failed: failed.length }, failed.length ? 'error' : 'ok', failed[0]?.error)
    return NextResponse.json({ ok: failed.length === 0, committed: true, planned: plan.length, created, failed })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    logAriaAction('acquisition.backfill', parsed, 'error', message)
    return NextResponse.json({ error: 'Backfill failed', details: message }, { status: 500 })
  }
}
