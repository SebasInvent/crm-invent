import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
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
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('agent_deliverables')
    .select('*, agents(name)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const deliverables = (data as Record<string, any>[] | null)?.map((d) => ({
    ...d,
    agent_name: d.agents?.name ?? null,
  })) ?? []

  return NextResponse.json({ deliverables })
}

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'deliverables-create' })
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
    agent_id: parsed.agent_id ?? null,
    project_id: parsed.project_id ?? null,
    contact_id: parsed.contact_id ?? null,
    file_url: parsed.file_url ?? null,
    approved_for_send: false,
    sent_to_client: false,
    generated_at: new Date().toISOString(),
    created_by: auth.user.id,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('agent_deliverables') as any)
    .insert(insert)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deliverable: data })
}
