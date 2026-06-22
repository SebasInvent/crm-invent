import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireOrg } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * /api/deliverables
 *
 * GET  → lista de entregables con nombre del agente.
 * POST → crea un entregable suelto (title + agente/proyecto opcionales).
 */

const createSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  agent_id: z.string().uuid().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
  file_url: z.string().url().max(1000).optional().nullable(),
})

export async function GET() {
  const org = await requireOrg()
  if (org.error) return org.error

  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('agent_deliverables')
    .select('*')
    .eq('org_id', org.orgId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Resolver el nombre del agente por separado (agent_deliverables tiene 2 FKs
  // a agents — agent_id y reviewed_by — así que el embed PostgREST es ambiguo).
  const rows = (data as Record<string, any>[] | null) ?? []
  const agentIds = [...new Set(rows.map((d) => d.agent_id).filter(Boolean))]
  const agentMap: Record<string, string> = {}
  if (agentIds.length) {
    const { data: ags } = await supabase.from('agents').select('id, name').in('id', agentIds)
    for (const a of (ags as Record<string, any>[] | null) ?? []) agentMap[a.id] = a.name
  }
  const deliverables = rows.map((d) => ({
    ...d,
    agent_name: d.agent_id ? agentMap[d.agent_id] ?? null : null,
  }))

  return NextResponse.json({ deliverables })
}

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'deliverables-create' })
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
    agent_id: parsed.agent_id ?? null,
    project_id: parsed.project_id ?? null,
    contact_id: parsed.contact_id ?? null,
    file_url: parsed.file_url ?? null,
    approved_for_send: false,
    sent_to_client: false,
    generated_at: new Date().toISOString(),
    created_by: org.user.id,
    org_id: org.orgId,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('agent_deliverables') as any)
    .insert(insert)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deliverable: data })
}
