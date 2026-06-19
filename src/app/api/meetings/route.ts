import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
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
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()

  const [{ data: meetings }, { data: followUps }] = await Promise.all([
    supabase
      .from('meetings')
      .select('*, contacts(first_name, last_name, company_name)')
      .order('scheduled_at', { ascending: true })
      .limit(300),
    supabase
      .from('leads')
      .select('id, name, company, email, lead_status, lead_score, next_follow_up_date')
      .not('next_follow_up_date', 'is', null)
      .order('next_follow_up_date', { ascending: true })
      .limit(200),
  ])

  const events = (meetings as Record<string, any>[] | null)?.map((m) => ({
    ...m,
    contact_name: m.contacts
      ? `${m.contacts.first_name ?? ''} ${m.contacts.last_name ?? ''}`.trim()
      : null,
    contact_company: m.contacts?.company_name ?? null,
  })) ?? []

  return NextResponse.json({ meetings: events, followUps: followUps ?? [] })
}

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'meetings-create' })
  if (block) return block

  const auth = await requireAuth()
  if (auth.error) return auth.error

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
    created_by: auth.user.id,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('meetings') as any)
    .insert(insert)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, meeting: data })
}
