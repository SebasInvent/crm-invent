import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * POST /api/projects
 *
 * Create a project tied to a client. Note: the projects table uses
 * client_id (NOT contact_id) — projects are scoped to the legacy
 * `clients` table. If we ever consolidate clients → contacts, this
 * route changes shape.
 */

const projectCreateSchema = z.object({
  name: z.string().min(1).max(200),
  client_id: z.string().uuid(),
  description: z.string().max(2000).optional().nullable(),
  status: z
    .enum(['planning', 'in_progress', 'review', 'completed', 'cancelled'])
    .optional()
    .default('planning'),
  budget: z.coerce.number().min(0).max(1_000_000_000).optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  progress: z.coerce.number().int().min(0).max(100).optional().default(0),
})

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'projects-create' })
  if (block) return block

  const auth = await requireAuth()
  if (auth.error) return auth.error

  let parsed: z.infer<typeof projectCreateSchema>
  try {
    parsed = projectCreateSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  const insert = {
    name: parsed.name,
    client_id: parsed.client_id,
    description: parsed.description,
    status: parsed.status,
    budget: parsed.budget,
    start_date: parsed.start_date || null,
    end_date: parsed.end_date || null,
    progress: parsed.progress,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('projects') as any)
    .insert(insert)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, project: data })
}
