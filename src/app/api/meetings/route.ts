import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireOrg } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * /api/meetings
 *
 * GET  → { meetings, followUps }: eventos del calendario (tabla meetings) +
 *        follow-ups de leads (next_follow_up_date) para mostrarlos juntos.
 * POST → crea un evento.
 */

const createSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  scheduled_at: z.string().min(1), // ISO datetime
  meeting_link: z.string().url().max(1000).optional().nullable().or(z.literal('')),
  contact_id: z.string().uuid().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
})

export async function GET() {
  const org = await requireOrg()
  if (org.error) return org.error

  const supabase = getServiceRoleClient()

  const [{ data: meetings }, { data: followUps }] = await Promise.all([
    supabase.from('meetings').select('*').eq('org_id', org.orgId).order('scheduled_at', { ascending: true }).limit(300),
    supabase
      .from('leads')
      .select('id, name, company, email, lead_status, lead_score, next_follow_up_date')
      .eq('org_id', org.orgId)
      .not('next_follow_up_date', 'is', null)
      .order('next_follow_up_date', { ascending: true })
      .limit(200),
  ])

  // Nombre del contacto por separado (meetings.contact_id no tiene FK → sin embed).
  const rows = (meetings as Record<string, any>[] | null) ?? []
  const contactIds = [...new Set(rows.map((m) => m.contact_id).filter(Boolean))]
  const contactMap: Record<string, { name: string; company: string | null }> = {}
  if (contactIds.length) {
    const { data: cs } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, company_name')
      .in('id', contactIds)
    for (const c of (cs as Record<string, any>[] | null) ?? []) {
      contactMap[c.id] = {
        name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
        company: c.company_name ?? null,
      }
    }
  }
  const events = rows.map((m) => ({
    ...m,
    contact_name: m.contact_id ? contactMap[m.contact_id]?.name ?? null : null,
    contact_company: m.contact_id ? contactMap[m.contact_id]?.company ?? null : null,
  }))

  return NextResponse.json({ meetings: events, followUps: followUps ?? [] })
}

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'meetings-create' })
  if (block) return block

  const org = await requireOrg()
  if (org.error) return org.error

  let parsed: z.infer<typeof createSchema>
  try {
    parsed = createSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()
  const insert = {
    title: parsed.title,
    description: parsed.description ?? null,
    scheduled_at: parsed.scheduled_at,
    meeting_link: parsed.meeting_link || null,
    contact_id: parsed.contact_id ?? null,
    project_id: parsed.project_id ?? null,
    status: 'scheduled',
    created_by: org.user.id,
    org_id: org.orgId,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('meetings') as any)
    .insert(insert)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, meeting: data })
}
